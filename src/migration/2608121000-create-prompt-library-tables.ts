import { MigrationInterface, QueryRunner } from 'typeorm';

// Creates the prompt_packages + prompt_versions tables for the Asset Hub Prompt Library.
// Unlike the Skill Package, the artifact is a plain text prompt stored inline in
// prompt_versions.prompt_content — there is NO files table, NO media FK, NO ZIP fetch.
//
// Circular FK strategy: prompt_packages.active_version_id → prompt_versions is added AFTER
// prompt_versions is created, avoiding chicken-and-egg DDL ordering. Both tables are created
// first, then the cross-reference FK is added via ALTER TABLE.
export class CreatePromptLibraryTables2608121000 implements MigrationInterface {
  name = 'CreatePromptLibraryTables2608121000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // prompt_packages — logical asset identity, one record per distinct published prompt.
    // active_version_id FK (ON DELETE SET NULL) is added after prompt_versions exists.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS prompt_packages (
        id                SERIAL PRIMARY KEY,
        created_at        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at        TIMESTAMP WITHOUT TIME ZONE,
        is_deleted        BOOLEAN DEFAULT FALSE,
        active_version_id INT,
        status            VARCHAR NOT NULL DEFAULT 'active',
        created_by        INT NOT NULL
      )
    `);

    // prompt_versions — immutable per-submission snapshot. ON DELETE RESTRICT on the package FK
    // prevents dangling versions; application handles cleanup before package deletion.
    // prompt_content holds the text artifact directly (no media/zip reference).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS prompt_versions (
        id                SERIAL PRIMARY KEY,
        created_at        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at        TIMESTAMP WITHOUT TIME ZONE,
        is_deleted        BOOLEAN DEFAULT FALSE,
        prompt_package_id INT NOT NULL,
        version_no        INT NOT NULL,
        state             VARCHAR NOT NULL DEFAULT 'pending',
        name              VARCHAR NOT NULL,
        short_description TEXT NOT NULL,
        category          VARCHAR NOT NULL,
        tags              JSONB NOT NULL DEFAULT '[]',
        avatar_url        VARCHAR,
        prompt_content    TEXT NOT NULL,
        changelog_note    TEXT,
        submitted_by      INT NOT NULL,
        reviewed_by       INT,
        reviewed_at       TIMESTAMP WITHOUT TIME ZONE,
        reject_reason     TEXT,
        CONSTRAINT fk_prompt_versions_package
          FOREIGN KEY (prompt_package_id)
          REFERENCES prompt_packages (id)
          ON DELETE RESTRICT
      )
    `);

    // Add circular FK: prompt_packages → prompt_versions, added after prompt_versions exists.
    // ON DELETE SET NULL: the package survives without a live version (re-publishable later).
    await queryRunner.query(`
      ALTER TABLE prompt_packages
      ADD CONSTRAINT fk_prompt_packages_active_version
        FOREIGN KEY (active_version_id)
        REFERENCES prompt_versions (id)
        ON DELETE SET NULL
    `);

    // Partial unique: at most ONE non-soft-deleted pending version per package.
    // is_deleted=false guard ensures a soft-deleted pending row does not freeze the slot.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_prompt_versions_one_pending_per_package
      ON prompt_versions (prompt_package_id)
      WHERE state = 'pending' AND is_deleted = false
    `);

    // Unique (package, version_no): catches concurrent submit races and any version_no collision.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_prompt_versions_package_version_no
      ON prompt_versions (prompt_package_id, version_no)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS uidx_prompt_versions_package_version_no');
    await queryRunner.query('DROP INDEX IF EXISTS uidx_prompt_versions_one_pending_per_package');
    // Drop circular FK first before dropping tables to avoid constraint errors.
    await queryRunner.query(`
      ALTER TABLE prompt_packages
      DROP CONSTRAINT IF EXISTS fk_prompt_packages_active_version
    `);
    await queryRunner.query('DROP TABLE IF EXISTS prompt_versions CASCADE');
    await queryRunner.query('DROP TABLE IF EXISTS prompt_packages CASCADE');
  }
}
