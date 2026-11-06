import { describe, expect, it } from 'vitest';
import { ARGON2_OPTIONS, PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with argon2id and the documented parameters', async () => {
    const hash = await service.hash('correct horse battery');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(ARGON2_OPTIONS).toMatchObject({
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    expect(hash).not.toContain('correct horse battery');
  });

  it('uses a fresh salt for every hash', async () => {
    const [a, b] = await Promise.all([
      service.hash('same password 1'),
      service.hash('same password 1'),
    ]);
    expect(a).not.toBe(b);
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await service.hash('correct horse battery');
    expect(await service.verify(hash, 'correct horse battery')).toBe(true);
    expect(await service.verify(hash, 'wrong horse battery')).toBe(false);
  });

  it('returns false instead of throwing for a malformed hash', async () => {
    expect(await service.verify('not-a-hash', 'whatever password')).toBe(false);
    expect(await service.verify('', 'whatever password')).toBe(false);
  });
});
