import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

export interface FieldError {
  /** Dotted path of the offending field, such as `sent.amount`. */
  field: string;
  messages: string[];
}

/** Walks class-validator's error tree into flat, field-keyed errors. */
export function collectFieldErrors(
  errors: ValidationError[],
  parent = '',
): FieldError[] {
  const out: FieldError[] = [];
  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      out.push({ field, messages: Object.values(error.constraints) });
    }
    if (error.children?.length) {
      out.push(...collectFieldErrors(error.children, field));
    }
  }
  return out;
}

/**
 * A 400 with the usual flat `message` array (unchanged for existing clients)
 * plus `errors`: the same problems grouped per field, which forms can show next
 * to the right input.
 */
export function validationError(errors: FieldError[]): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: errors.flatMap((error) => error.messages),
    errors,
  });
}

/** The application-wide validation pipe: strict, with field-level errors. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => validationError(collectFieldErrors(errors)),
  });
}
