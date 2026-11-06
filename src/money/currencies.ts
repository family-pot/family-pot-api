import { UnsupportedCurrencyError } from './errors.js';

/**
 * Decimal places of the minor unit for each ISO 4217 currency we know about
 * (ADR 0004: "Currency exponents come from a constant table").
 */
const EXPONENTS = {
  // MVP currencies.
  GBP: 2,
  USD: 2,
  EUR: 2,
  CAD: 2,
  NGN: 2,
  GHS: 2,
  KES: 2,
  INR: 2,
  PHP: 2,
  // Known to the table (for conversion maths and tests) but not enabled for
  // the MVP: they show the 0- and 3-decimal cases of ADR 0004.
  JPY: 0,
  KWD: 3,
} as const;

export type CurrencyCode = keyof typeof EXPONENTS;

/** Currencies the product accepts today (ADR 0004). */
export const SUPPORTED_CURRENCIES = [
  'GBP',
  'USD',
  'EUR',
  'CAD',
  'NGN',
  'GHS',
  'KES',
  'INR',
  'PHP',
] as const satisfies readonly CurrencyCode[];

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** True for any currency with a known exponent (not only the MVP ones). */
export function isKnownCurrency(code: string): code is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(EXPONENTS, code);
}

/** True for the MVP currencies that user-facing input may use. */
export function isSupportedCurrency(code: string): code is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}

/** Number of decimal places in the currency's minor unit. */
export function exponentOf(code: string): number {
  if (!isKnownCurrency(code)) {
    throw new UnsupportedCurrencyError(`Unknown currency "${code}".`);
  }
  return EXPONENTS[code];
}
