import { MigrationInterface, QueryRunner } from 'typeorm';

// ma_tool_cstb_rpt_properties is a Strapi-origin table. Its entity now extends
// BaseSoftDeleteEntity (deleted_at + is_deleted), but with synchronize disabled
// in production the physical columns are absent — and the record-scope SQL filters
// `deleted_at IS NULL AND is_deleted IS NOT TRUE`, so a missing column throws at
// query time. Add both columns idempotently. deleted_at matches the base entity's
// `timestamp without time zone` mapping; is_deleted mirrors the flag added to
// every other soft-delete table.
export class AddSoftDeleteColsMaToolCstbRptProperties2607011200 implements MigrationInterface {
  name = 'AddSoftDeleteColsMaToolCstbRptProperties2607011200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ma_tool_cstb_rpt_properties" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITHOUT TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "ma_tool_cstb_rpt_properties" ADD COLUMN IF NOT EXISTS "is_deleted" boolean DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ma_tool_cstb_rpt_properties" DROP COLUMN IF EXISTS "is_deleted"`);
    await queryRunner.query(`ALTER TABLE "ma_tool_cstb_rpt_properties" DROP COLUMN IF EXISTS "deleted_at"`);
  }
}
