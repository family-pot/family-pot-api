import { registerDecorator, type ValidationOptions } from 'class-validator';
import { ExchangeRate, MAX_MINOR_UNITS } from '../money/index.js';

const MINOR_UNITS = /^(0|[1-9]\d*)$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Earliest accepted transfer date. */
export const EARLIEST_TRANSFER_DATE = '2000-01-01';
/** How far into the future a transfer date may be (to allow for time zones). */
export const MAX_DAYS_IN_FUTURE = 1;

/** True when `value` is a canonical minor-units string within the database range. */
export function isMinorUnits(
  value: unknown,
  { positive }: { positive: boolean },
): boolean {
  if (typeof value !== 'string' || !MINOR_UNITS.test(value)) return false;
  const amount = BigInt(value);
  return amount <= MAX_MINOR_UNITS && (!positive || amount > 0n);
}

export function isExchangeRate(value: unknown): boolean {
  try {
    ExchangeRate.parse(value as string);
    return true;
  } catch {
    return false;
  }
}

/** A real calendar date `YYYY-MM-DD`, with no range restriction (used for filters and cursors). */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * A real calendar date `YYYY-MM-DD` from 2000-01-01 up to one day after today
 * (UTC). The one day of slack covers senders in time zones ahead of UTC.
 */
export function isTransferDate(
  value: unknown,
  now: Date = new Date(),
): boolean {
  if (!isCalendarDate(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  const latest = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + MAX_DAYS_IN_FUTURE,
  );
  return value >= EARLIEST_TRANSFER_DATE && parsed.getTime() <= latest;
}

function decorator(
  name: string,
  validate: (value: unknown) => boolean,
  message: string,
  options?: ValidationOptions,
): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name,
      target: target.constructor,
      propertyName: propertyKey as string,
      options,
      validator: { validate, defaultMessage: () => message },
    });
  };
}

export const IsMinorUnits = (positive: boolean): PropertyDecorator =>
  decorator(
    'isMinorUnits',
    (value) => isMinorUnits(value, { positive }),
    positive
      ? 'amount must be a positive whole number of minor units, as a string (for example "15000" for 150.00).'
      : 'amount must be a non-negative whole number of minor units, as a string.',
  );

export const IsExchangeRate = (): PropertyDecorator =>
  decorator(
    'isExchangeRate',
    isExchangeRate,
    'exchangeRate must be a positive decimal string with at most 12 decimal places, such as "1950.5".',
  );

export const IsCalendarDate = (): PropertyDecorator =>
  decorator(
    'isCalendarDate',
    isCalendarDate,
    'must be a real date in the format YYYY-MM-DD.',
  );

export const IsTransferDate = (): PropertyDecorator =>
  decorator(
    'isTransferDate',
    (value) => isTransferDate(value),
    `transferDate must be a real date (YYYY-MM-DD) between ${EARLIEST_TRANSFER_DATE} and ${MAX_DAYS_IN_FUTURE} day after today (UTC).`,
  );
