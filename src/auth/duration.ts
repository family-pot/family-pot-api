const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

/** Seconds in a duration such as "30s", "15m", "1h" or "7d" (the JWT_ACCESS_TTL format). */
export function durationToSeconds(duration: string): number {
  const match = /^([1-9]\d*)(s|m|h|d)$/.exec(duration);
  if (!match) {
    throw new Error(`"${duration}" is not a valid duration such as 15m.`);
  }
  return Number(match[1]) * UNIT_SECONDS[match[2] as keyof typeof UNIT_SECONDS];
}
