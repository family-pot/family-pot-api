import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransfers1793950300067 implements MigrationInterface {
  name = 'CreateTransfers1793950300067';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "transfers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "recipientId" uuid NOT NULL, "transferDate" date NOT NULL, "sentAmountMinor" bigint NOT NULL, "sentCurrency" character varying(3) NOT NULL, "receivingCurrency" character varying(3) NOT NULL, "exchangeRate" numeric(24,12) NOT NULL, "feeMinor" bigint NOT NULL, "provider" character varying(100) NOT NULL, "purpose" character varying(200), "status" character varying(16) NOT NULL DEFAULT 'pending', "notes" character varying(500), CONSTRAINT "CHK_8e18a1a4c141db1cfbee34c1c5" CHECK ("feeMinor" >= 0), CONSTRAINT "CHK_f661626c617f6bebfcf1b2104a" CHECK ("sentAmountMinor" > 0), CONSTRAINT "CHK_31df2f971cb8b6a7f923437259" CHECK ("status" IN ('pending', 'completed', 'failed', 'cancelled')), CONSTRAINT "PK_f712e908b465e0085b4408cabc3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_46bdc5962269c3679be53ee925" ON "transfers"  ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "transfers" ADD CONSTRAINT "FK_46bdc5962269c3679be53ee9257" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfers" ADD CONSTRAINT "FK_21d9f3bb07c5c9b4d9a2436f0d7" FOREIGN KEY ("recipientId") REFERENCES "recipients"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transfers" DROP CONSTRAINT "FK_21d9f3bb07c5c9b4d9a2436f0d7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfers" DROP CONSTRAINT "FK_46bdc5962269c3679be53ee9257"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_46bdc5962269c3679be53ee925"`,
    );
    await queryRunner.query(`DROP TABLE "transfers"`);
  }
}
