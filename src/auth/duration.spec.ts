import { describe, expect, it } from 'vitest';
import { durationToSeconds } from './duration.js';

describe('durationToSeconds', () => {
  it('converts each unit', () => {
    expect(durationToSeconds('30s')).toBe(30);
    expect(durationToSeconds('15m')).toBe(900);
    expect(durationToSeconds('1h')).toBe(3600);
    expect(durationToSeconds('7d')).toBe(604800);
  });

  it.each(['', '15', 'm', '0m', '-5m', '1.5h', '15 m', '15M', '15w'])(
    'rejects %j',
    (value) => {
      expect(() => durationToSeconds(value)).toThrow(/not a valid duration/);
    },
  );
});
