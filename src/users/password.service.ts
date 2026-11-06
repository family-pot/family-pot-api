import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Argon2id parameters: the OWASP Password Storage Cheat Sheet minimum
 * configuration of 19 MiB of memory, 2 iterations and 1 lane
 * (https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
 * The parameters are encoded in each stored hash, so they can be raised later
 * and old hashes still verify.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  /** False for a wrong password or a malformed hash; never throws for those. */
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
