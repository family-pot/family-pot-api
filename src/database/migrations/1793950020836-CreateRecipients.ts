import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRecipients1793950020836 implements MigrationInterface {
  name = 'CreateRecipients1793950020836';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "recipients" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "name" character varying(100) NOT NULL, "country" character varying(2) NOT NULL, "notes" character varying(500), CONSTRAINT "PK_de8fc5a9c364568f294798fe1e9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7b58601301bacb8e4f20d2800b" ON "recipients"  ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "recipients" ADD CONSTRAINT "FK_7b58601301bacb8e4f20d2800b0" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recipients" DROP CONSTRAINT "FK_7b58601301bacb8e4f20d2800b0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7b58601301bacb8e4f20d2800b"`,
    );
    await queryRunner.query(`DROP TABLE "recipients"`);
  }
}
