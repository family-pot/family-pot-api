import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransferListIndexes1793950541333 implements MigrationInterface {
  name = 'AddTransferListIndexes1793950541333';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_46bdc5962269c3679be53ee925"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transfers_user_status_date" ON "transfers"  ("userId", "status", "transferDate", "id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transfers_user_recipient_date" ON "transfers"  ("userId", "recipientId", "transferDate", "id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transfers_user_date" ON "transfers"  ("userId", "transferDate", "id") `,
    );
    // Hand-written: TypeORM cannot declare expression indexes. It backs the
    // case-insensitive provider filter, which compares LOWER("provider").
    // The entity marks it { synchronize: false } so migration:check ignores it.
    await queryRunner.query(
      `CREATE INDEX "IDX_transfers_user_provider_date" ON "transfers" ("userId", LOWER("provider"), "transferDate", "id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_transfers_user_provider_date"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_transfers_user_date"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_transfers_user_recipient_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_transfers_user_status_date"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_46bdc5962269c3679be53ee925" ON "transfers" USING btree ("userId") `,
    );
  }
}
