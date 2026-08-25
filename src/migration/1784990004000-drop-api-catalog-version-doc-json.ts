import { MigrationInterface, QueryRunner } from 'typeorm';

// Docs tables (req/res/error/sequence) duplicated usage_guide_html + mock_req.
export class DropApiCatalogVersionDocJson1784990004000 implements MigrationInterface {
  name = 'DropApiCatalogVersionDocJson1784990004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE api_catalog_versions DROP COLUMN IF EXISTS req_params');
    await queryRunner.query('ALTER TABLE api_catalog_versions DROP COLUMN IF EXISTS res_params');
    await queryRunner.query('ALTER TABLE api_catalog_versions DROP COLUMN IF EXISTS error_codes');
    await queryRunner.query('ALTER TABLE api_catalog_versions DROP COLUMN IF EXISTS sequence_diagram');
    await queryRunner.query('ALTER TABLE api_catalog_versions DROP COLUMN IF EXISTS definition');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE api_catalog_versions ADD COLUMN IF NOT EXISTS req_params JSONB NOT NULL DEFAULT '[]'`);
    await queryRunner.query(`ALTER TABLE api_catalog_versions ADD COLUMN IF NOT EXISTS res_params JSONB NOT NULL DEFAULT '[]'`);
    await queryRunner.query(`ALTER TABLE api_catalog_versions ADD COLUMN IF NOT EXISTS error_codes JSONB NOT NULL DEFAULT '[]'`);
    await queryRunner.query(
      `ALTER TABLE api_catalog_versions ADD COLUMN IF NOT EXISTS sequence_diagram JSONB NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query('ALTER TABLE api_catalog_versions ADD COLUMN IF NOT EXISTS definition TEXT');
  }
}
