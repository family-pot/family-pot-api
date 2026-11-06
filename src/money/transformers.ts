/**
 * Structurally identical to TypeORM's `ValueTransformer`, declared here so the
 * money module does not depend on the database layer.
 */
export interface ColumnTransformer<Entity, Database> {
  to(value: Entity): Database;
  from(value: Database): Entity;
}

/**
 * Postgres `bigint` and `numeric` come back from the driver as strings, which
 * is wanted for money (ADR 0003). These transformers keep them out of
 * JavaScript `number`.
 *
 * Usage:
 *   @Column({ type: 'bigint', transformer: bigintTransformer })
 *   amountMinor: bigint;
 *
 *   @Column({ type: 'numeric', precision: 24, scale: 12, transformer: numericStringTransformer })
 *   exchangeRate: string;
 */
export const bigintTransformer: ColumnTransformer<
  bigint | null | undefined,
  string | null | undefined
> = {
  to: (value: bigint | null | undefined): string | null | undefined =>
    value === null || value === undefined ? value : value.toString(),
  from: (value: string | null | undefined): bigint | null | undefined =>
    value === null || value === undefined ? value : BigInt(value),
};

/**
 * Keeps a `numeric` value as the decimal string the driver returns. The
 * database pads the scale ("1950.500000000000"), so the trailing zeros are
 * trimmed to give the canonical string used on the wire ("1950.5").
 */
export const numericStringTransformer: ColumnTransformer<
  string | null | undefined,
  string | null | undefined
> = {
  to: (value: string | null | undefined): string | null | undefined => value,
  from: (value: string | null | undefined): string | null | undefined =>
    value === null || value === undefined
      ? value
      : value.includes('.')
        ? value.replace(/\.?0+$/, '')
        : value,
};
