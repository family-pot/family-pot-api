import {
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { isCountryCode } from './countries.js';

@ValidatorConstraint({ name: 'isCountryCode', async: false })
export class CountryCodeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isCountryCode(value);
  }

  defaultMessage(): string {
    return 'country must be an ISO 3166-1 alpha-2 country code, such as NG.';
  }
}
