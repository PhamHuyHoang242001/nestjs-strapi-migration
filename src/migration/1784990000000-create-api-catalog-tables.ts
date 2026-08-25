import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateApiCatalogTables1784990000000 implements MigrationInterface {
  name = 'CreateApiCatalogTables1784990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS api_catalog_packages (
        id                SERIAL PRIMARY KEY,
        created_at        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at        TIMESTAMP WITHOUT TIME ZONE,
        is_deleted        BOOLEAN DEFAULT FALSE,
        active_version_id INT,
        status            VARCHAR NOT NULL DEFAULT 'active',
        code              VARCHAR NOT NULL DEFAULT '',
        created_by        INT NOT NULL,
        publisher_id      INT NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS api_catalog_versions (
        id                SERIAL PRIMARY KEY,
        created_at        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at        TIMESTAMP WITHOUT TIME ZONE,
        is_deleted        BOOLEAN DEFAULT FALSE,
        api_catalog_package_id    INT NOT NULL,
        version_no        INT NOT NULL,
        old_version       INT,
        state             VARCHAR NOT NULL DEFAULT 'pending',
        name              VARCHAR NOT NULL,
        short_description TEXT NOT NULL,
        category_id       INT,
        usage_guide_html  TEXT NOT NULL DEFAULT '',
        avatar_url        VARCHAR,
        http_method       VARCHAR NOT NULL,
        endpoint_path     VARCHAR NOT NULL,
        input_format      VARCHAR NOT NULL DEFAULT 'body',
        call_mode         VARCHAR NOT NULL DEFAULT 'sync',
        sync_timeout      VARCHAR,
        sla               VARCHAR,
        tps               VARCHAR,
        latency_p95       VARCHAR,
        throughput        VARCHAR,
        max_payload       VARCHAR,
        rate_limit        VARCHAR,
        encryption        VARCHAR,
        mock_req          JSONB NOT NULL DEFAULT '{}',
        mock_res          JSONB NOT NULL DEFAULT '{}',
        changelog_note    TEXT,
        submitted_by      INT NOT NULL,
        reviewed_by       INT,
        reviewed_at       TIMESTAMP WITHOUT TIME ZONE,
        reject_reason     TEXT,
        CONSTRAINT fk_api_catalog_versions_package
          FOREIGN KEY (api_catalog_package_id)
          REFERENCES api_catalog_packages (id)
          ON DELETE RESTRICT,
        CONSTRAINT chk_api_catalog_versions_input_format
          CHECK (input_format IN ('body', 'query', 'upload_file')),
        CONSTRAINT chk_api_catalog_versions_http_method
          CHECK (http_method IN ('GET', 'POST', 'PUT', 'DELETE')),
        CONSTRAINT chk_api_catalog_versions_call_mode
          CHECK (call_mode IN ('sync', 'async'))
      )
    `);

    await queryRunner.query(`
      ALTER TABLE api_catalog_packages
      ADD CONSTRAINT fk_api_catalog_packages_active_version
        FOREIGN KEY (active_version_id)
        REFERENCES api_catalog_versions (id)
        ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_api_catalog_versions_one_pending_per_package
      ON api_catalog_versions (api_catalog_package_id)
      WHERE state = 'pending' AND is_deleted = false
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_api_catalog_versions_package_version_no
      ON api_catalog_versions (api_catalog_package_id, version_no)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS api_catalog_package_responsibles (
        id SERIAL PRIMARY KEY,
        api_catalog_package_id INT NOT NULL,
        user_id INT NOT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP WITHOUT TIME ZONE,
        is_deleted BOOLEAN DEFAULT FALSE,
        CONSTRAINT uq_api_catalog_package_responsibles UNIQUE (api_catalog_package_id, user_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS api_catalog_version_tags (
        id SERIAL PRIMARY KEY,
        api_catalog_version_id INT NOT NULL,
        tag_id INT NOT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP WITHOUT TIME ZONE,
        is_deleted BOOLEAN DEFAULT FALSE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS api_catalog_version_tags CASCADE');
    await queryRunner.query('DROP TABLE IF EXISTS api_catalog_package_responsibles CASCADE');
    await queryRunner.query('DROP INDEX IF EXISTS uidx_api_catalog_versions_package_version_no');
    await queryRunner.query('DROP INDEX IF EXISTS uidx_api_catalog_versions_one_pending_per_package');
    await queryRunner.query(`
      ALTER TABLE api_catalog_packages DROP CONSTRAINT IF EXISTS fk_api_catalog_packages_active_version
    `);
    await queryRunner.query('DROP TABLE IF EXISTS api_catalog_versions CASCADE');
    await queryRunner.query('DROP TABLE IF EXISTS api_catalog_packages CASCADE');
  }
}
