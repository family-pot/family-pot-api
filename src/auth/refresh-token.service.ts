import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, type EntityManager, IsNull } from 'typeorm';
import { AppConfigService } from '../config/app-config.service.js';
import { RefreshToken } from './refresh-token.entity.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export type RotationResult =
  | { status: 'rotated'; userId: string; token: string }
  /** Unknown, expired or revoked token. Nothing else changes. */
  | { status: 'invalid' }
  /** An already-rotated token was presented: its whole family was revoked. */
  | { status: 'reuse_detected' };

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
  ) {}

  get lifetimeMs(): number {
    return this.config.refreshTokenTtlDays * DAY_MS;
  }

  /** Starts a new family (a new login session). Returns the raw token to give to the client. */
  async issue(userId: string): Promise<string> {
    const { token } = await this.insert(
      this.dataSource.manager,
      userId,
      randomUUID(),
    );
    return token;
  }

  /**
   * Exchanges a refresh token for a new one (rotation).
   *
   * Runs in a transaction that locks the presented token's row, so two
   * concurrent requests with the same token are serialized: the first rotates
   * it, the second then sees a rotated token, which counts as reuse and revokes
   * the whole family. This is intentionally strict; see the README.
   */
  async rotate(rawToken: string): Promise<RotationResult> {
    return this.dataSource.transaction(async (manager) => {
      const current = await manager.findOne(RefreshToken, {
        where: { tokenHash: hashRefreshToken(rawToken) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) {
        return { status: 'invalid' };
      }

      const now = new Date();
      if (current.revokedAt !== null) {
        if (current.replacedById !== null) {
          // A token that was already rotated is being used again: assume it was
          // stolen and end the whole session. Committed even though the caller
          // answers 401.
          await this.revokeFamily(manager, current.familyId, now);
          return { status: 'reuse_detected' };
        }
        return { status: 'invalid' }; // revoked by logout or an earlier reuse
      }
      if (current.expiresAt <= now) {
        return { status: 'invalid' };
      }

      const next = await this.insert(manager, current.userId, current.familyId);
      current.revokedAt = now;
      current.replacedById = next.id;
      await manager.save(current);
      return { status: 'rotated', userId: current.userId, token: next.token };
    });
  }

  /** Revokes the whole family of the presented token (logout). Unknown tokens are ignored. */
  async revokeFamilyOf(rawToken: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const current = await manager.findOne(RefreshToken, {
        where: { tokenHash: hashRefreshToken(rawToken) },
      });
      if (current) {
        await this.revokeFamily(manager, current.familyId, new Date());
      }
    });
  }

  private async revokeFamily(
    manager: EntityManager,
    familyId: string,
    now: Date,
  ): Promise<void> {
    await manager.update(
      RefreshToken,
      { familyId, revokedAt: IsNull() },
      { revokedAt: now },
    );
  }

  private async insert(
    manager: EntityManager,
    userId: string,
    familyId: string,
  ): Promise<{ id: string; token: string }> {
    const token = randomBytes(32).toString('base64url');
    const saved = await manager.save(
      manager.create(RefreshToken, {
        userId,
        familyId,
        tokenHash: hashRefreshToken(token),
        expiresAt: new Date(Date.now() + this.lifetimeMs),
        revokedAt: null,
        replacedById: null,
      }),
    );
    return { id: saved.id, token };
  }
}
