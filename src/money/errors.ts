/** Base class so callers can catch every money-related failure at once. */
export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidAmountError extends MoneyError {}
export class NegativeAmountError extends MoneyError {}
export class UnsupportedCurrencyError extends MoneyError {}
export class CurrencyMismatchError extends MoneyError {}
export class InvalidRateError extends MoneyError {}
