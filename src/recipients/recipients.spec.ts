import { describe, expect, it } from 'vitest';
import { COUNTRY_CODES, isCountryCode } from './countries.js';
import { RecipientUsageRegistry } from './recipient-usage.registry.js';

describe('country codes', () => {
  it('has the 249 officially assigned ISO 3166-1 alpha-2 codes', () => {
    expect(COUNTRY_CODES.size).toBe(249);
  });

  it('accepts real codes and rejects everything else', () => {
    for (const code of ['NG', 'GB', 'US', 'GH', 'KE', 'IN', 'PH', 'MX']) {
      expect(isCountryCode(code)).toBe(true);
    }
    for (const bad of [
      'ng',
      'XX',
      'NGA',
      'N',
      '',
      'Nigeria',
      'UK',
      ' NG',
      42,
      null,
      undefined,
    ]) {
      expect(isCountryCode(bad)).toBe(false);
    }
  });
});

describe('RecipientUsageRegistry', () => {
  it('reports nothing when no checker is registered', async () => {
    expect(await new RecipientUsageRegistry().usage('u', 'r')).toEqual({});
  });

  it('reports only the kinds of records that reference the recipient', async () => {
    const registry = new RecipientUsageRegistry();
    registry.register('transfers', {
      count: async (_u, r) => (r === 'in-use' ? 3 : 0),
    });
    registry.register('reminders', { count: async () => 0 });

    expect(await registry.usage('u', 'in-use')).toEqual({ transfers: 3 });
    expect(await registry.usage('u', 'free')).toEqual({});
  });

  it('passes the user id so checks stay scoped to the owner', async () => {
    const registry = new RecipientUsageRegistry();
    const seen: string[] = [];
    registry.register('x', {
      count: async (userId) => {
        seen.push(userId);
        return 0;
      },
    });
    await registry.usage('user-1', 'r');
    expect(seen).toEqual(['user-1']);
  });
});
