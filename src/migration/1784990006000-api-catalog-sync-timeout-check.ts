import { MigrationInterface, QueryRunner } from 'typeorm';

export class ApiCatalogSyncTimeoutCheck1784990006000 implements MigrationInterface {
  name = 'ApiCatalogSyncTimeoutCheck1784990006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE api_catalog_versions
      SET sync_timeout = NULL
      WHERE call_mode = 'async'
    `);
    await queryRunner.query(
      'ALTER TABLE api_catalog_versions DROP CONSTRAINT IF EXISTS chk_api_catalog_versions_sync_timeout',
    );
    await queryRunner.query(`
      ALTER TABLE api_catalog_versions
      ADD CONSTRAINT chk_api_catalog_versions_sync_timeout
      CHECK (
        (call_mode = 'async' AND sync_timeout IS NULL)
        OR (call_mode = 'sync' AND sync_timeout IS NOT NULL AND btrim(sync_timeout) <> '')
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE api_catalog_versions DROP CONSTRAINT IF EXISTS chk_api_catalog_versions_sync_timeout',
    );
  }
}
