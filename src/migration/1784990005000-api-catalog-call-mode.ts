import { MigrationInterface, QueryRunner } from 'typeorm';

export class ApiCatalogCallMode1784990005000 implements MigrationInterface {
  name = 'ApiCatalogCallMode1784990005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE api_catalog_versions
      ADD COLUMN IF NOT EXISTS call_mode VARCHAR NOT NULL DEFAULT 'sync'
    `);
    await queryRunner.query(`
      ALTER TABLE api_catalog_versions
      ADD COLUMN IF NOT EXISTS sync_timeout VARCHAR
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'api_catalog_versions' AND column_name = 'supports_sync'
        ) THEN
          UPDATE api_catalog_versions SET call_mode = CASE
            WHEN COALESCE(supports_async, false) AND NOT COALESCE(supports_sync, false) THEN 'async'
            ELSE 'sync'
          END;
        END IF;
      END $$;
    `);
    await queryRunner.query('ALTER TABLE api_catalog_versions DROP CONSTRAINT IF EXISTS chk_api_catalog_versions_call_mode');
    await queryRunner.query(`
      ALTER TABLE api_catalog_versions
      ADD CONSTRAINT chk_api_catalog_versions_call_mode
      CHECK (call_mode IN ('sync', 'async'))
    `);
    await queryRunner.query('ALTER TABLE api_catalog_versions DROP COLUMN IF EXISTS supports_sync');
    await queryRunner.query('ALTER TABLE api_catalog_versions DROP COLUMN IF EXISTS supports_async');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE api_catalog_versions ADD COLUMN IF NOT EXISTS supports_sync BOOLEAN NOT NULL DEFAULT TRUE',
    );
    await queryRunner.query(
      'ALTER TABLE api_catalog_versions ADD COLUMN IF NOT EXISTS supports_async BOOLEAN NOT NULL DEFAULT FALSE',
    );
    await queryRunner.query(`
      UPDATE api_catalog_versions SET
        supports_sync = call_mode = 'sync',
        supports_async = call_mode = 'async'
    `);
    await queryRunner.query('ALTER TABLE api_catalog_versions DROP CONSTRAINT IF EXISTS chk_api_catalog_versions_call_mode');
    await queryRunner.query(`
      ALTER TABLE api_catalog_versions
      ADD CONSTRAINT chk_api_catalog_versions_call_mode
      CHECK (supports_sync = true OR supports_async = true)
    `);
    await queryRunner.query('ALTER TABLE api_catalog_versions DROP COLUMN IF EXISTS call_mode');
    await queryRunner.query('ALTER TABLE api_catalog_versions DROP COLUMN IF EXISTS sync_timeout');
  }
}
