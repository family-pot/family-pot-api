import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../database/base.entity.js';
import { User } from '../users/user.entity.js';

/**
 * One refresh token of a login session. Tokens rotate on every use; all the
 * tokens descended from one login share a `familyId`, so reuse of an old token
 * can revoke the whole session. Only a SHA-256 hash of the token is stored.
 */
@Entity({ name: 'refresh_tokens' })
export class RefreshToken extends AppBaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Index()
  @Column({ type: 'uuid' })
  familyId: string;

  /** Hex SHA-256 of the raw token. The raw token is never stored or logged. */
  @Column({ type: 'varchar', length: 64, unique: true })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** Set when this token was rotated: the id of the token that replaced it. */
  @Column({ type: 'uuid', nullable: true })
  replacedById: string | null;
}
