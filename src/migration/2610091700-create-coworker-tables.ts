import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCoworkerTables2610091700 implements MigrationInterface {
  name = 'CreateCoworkerTables2610091700';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS coworker_packages (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP WITHOUT TIME ZONE,
        is_deleted BOOLEAN DEFAULT FALSE,
        active_version_id INT,
        status VARCHAR NOT NULL DEFAULT 'active',
        code VARCHAR(100) NOT NULL,
        created_by INT NOT NULL,
        publisher_id INT NOT NULL,
        owning_unit_name VARCHAR(500)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_coworker_packages_code_live
      ON coworker_packages (code)
      WHERE deleted_at IS NULL AND is_deleted IS NOT TRUE
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS coworker_versions (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP WITHOUT TIME ZONE,
        is_deleted BOOLEAN DEFAULT FALSE,
        coworker_package_id INT NOT NULL REFERENCES coworker_packages(id) ON DELETE RESTRICT,
        version_no INT NOT NULL,
        old_version INT,
        state VARCHAR NOT NULL DEFAULT 'pending',
        name VARCHAR NOT NULL,
        short_description TEXT NOT NULL,
        kind VARCHAR(20) NOT NULL DEFAULT 'personal',
        avatar_url VARCHAR,
        model_id INT NOT NULL,
        link VARCHAR NOT NULL,
        changelog_note TEXT,
        submitted_by INT NOT NULL,
        reviewed_by INT,
        reviewed_at TIMESTAMP WITHOUT TIME ZONE,
        reject_reason TEXT
      )
    `);
    await queryRunner.query(`
      ALTER TABLE coworker_packages
      ADD CONSTRAINT fk_coworker_packages_active_version
        FOREIGN KEY (active_version_id) REFERENCES coworker_versions (id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_coworker_versions_one_pending_per_package
      ON coworker_versions (coworker_package_id)
      WHERE state = 'pending' AND deleted_at IS NULL AND is_deleted IS NOT TRUE
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_coworker_versions_approved_version_no
      ON coworker_versions (coworker_package_id, version_no)
      WHERE state = 'approved' AND deleted_at IS NULL AND is_deleted IS NOT TRUE
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS coworker_package_responsibles (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP WITHOUT TIME ZONE,
        is_deleted BOOLEAN DEFAULT FALSE,
        coworker_package_id INT NOT NULL,
        user_id INT NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_hub_coworker_channels (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP WITHOUT TIME ZONE,
        is_deleted BOOLEAN DEFAULT FALSE,
        name VARCHAR NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_hub_coworker_models (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP WITHOUT TIME ZONE,
        is_deleted BOOLEAN DEFAULT FALSE,
        name VARCHAR NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS coworker_version_channels (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP WITHOUT TIME ZONE,
        is_deleted BOOLEAN DEFAULT FALSE,
        coworker_version_id INT NOT NULL,
        channel_id INT NOT NULL
      )
    `);

    await queryRunner.query(`
      INSERT INTO ai_hub_coworker_channels (name) SELECT 'Microsoft Teams'
      WHERE NOT EXISTS (SELECT 1 FROM ai_hub_coworker_channels WHERE name = 'Microsoft Teams' AND deleted_at IS NULL)
    `);
    await queryRunner.query(`
      INSERT INTO ai_hub_coworker_models (name) SELECT 'GPT-4.1'
      WHERE NOT EXISTS (SELECT 1 FROM ai_hub_coworker_models WHERE name = 'GPT-4.1' AND deleted_at IS NULL)
    `);

    const mod = (await queryRunner.query(
      `SELECT id FROM modules WHERE path = '/asset-hub/coworker' AND deleted_at IS NULL LIMIT 1`,
    )) as Array<{ id: number }>;
    if (!mod[0]) throw new Error('Coworker child module missing; run 2610091600 first');
    const moduleId = Number(mod[0].id);
    const maxPerm = (await queryRunner.query(`SELECT COALESCE(MAX(id), 0)::int AS max FROM permission`)) as Array<{
      max: number;
    }>;
    const uploadId = Number(maxPerm[0]?.max ?? 0) + 1;
    const approveId = uploadId + 1;
    await queryRunner.query(
      `INSERT INTO permission (id, name, code, method, action, is_active, module_id)
       SELECT $1, 'Upload Coworker', 'coworker_upload', 'POST', 'upload', true, $2
       WHERE NOT EXISTS (SELECT 1 FROM permission WHERE code = 'coworker_upload' AND deleted_at IS NULL)`,
      [uploadId, moduleId],
    );
    await queryRunner.query(
      `INSERT INTO permission (id, name, code, method, action, is_active, module_id)
       SELECT $1, 'Approve Coworker', 'coworker_approve', 'PATCH', 'approve', true, $2
       WHERE NOT EXISTS (SELECT 1 FROM permission WHERE code = 'coworker_approve' AND deleted_at IS NULL)`,
      [approveId, moduleId],
    );
    await queryRunner.query(
      `SELECT setval(pg_get_serial_sequence('permission', 'id'), (SELECT COALESCE(MAX(id), 1) FROM permission))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM permission WHERE code IN ('coworker_upload', 'coworker_approve')`);
    await queryRunner.query(`DROP TABLE IF EXISTS coworker_version_channels`);
    await queryRunner.query(`DROP TABLE IF EXISTS ai_hub_coworker_models`);
    await queryRunner.query(`DROP TABLE IF EXISTS ai_hub_coworker_channels`);
    await queryRunner.query(`DROP TABLE IF EXISTS coworker_package_responsibles`);
    await queryRunner.query(
      `ALTER TABLE coworker_packages DROP CONSTRAINT IF EXISTS fk_coworker_packages_active_version`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS coworker_versions`);
    await queryRunner.query(`DROP TABLE IF EXISTS coworker_packages`);
  }
}
