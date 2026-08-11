import { MigrationInterface, QueryRunner } from 'typeorm';

// Creates the skill_packages + skill_versions tables for the Asset Hub Skill Package workspace.
// File/media rows reuse the existing `media` table; provider_uid column is added here to hold
// the Strapi file ID returned by the Strapi v5 upload API (deduplication / lifecycle link).
//
// Circular FK strategy: skill_packages.active_version_id → skill_versions is added AFTER
// skill_versions is created, avoiding chicken-and-egg DDL ordering. Both tables are created
// first, then the cross-reference FK is added via ALTER TABLE.
export class CreateSkillPackageTables2608110900 implements MigrationInterface {
  name = 'CreateSkillPackageTables2608110900';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extend media table with Strapi provider uid — nullable so existing rows are unaffected.
    // provider_uid = Strapi file id string; used for lifecycle callbacks (delete from Strapi
    // when NestJS soft-deletes the media row).
    await queryRunner.query(`
      ALTER TABLE media
      ADD COLUMN IF NOT EXISTS provider_uid VARCHAR
    `);

    // skill_packages — logical asset identity, one record per distinct published skill.
    // active_version_id FK (ON DELETE SET NULL) is added after skill_versions exists.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS skill_packages (
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

    // skill_versions — immutable per-submission snapshot. ON DELETE RESTRICT on the package FK
    // prevents dangling versions; application handles cleanup before package deletion.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS skill_versions (
        id                SERIAL PRIMARY KEY,
        created_at        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at        TIMESTAMP WITHOUT TIME ZONE,
        is_deleted        BOOLEAN DEFAULT FALSE,
        skill_package_id  INT NOT NULL,
        version_no        INT NOT NULL,
        state             VARCHAR NOT NULL DEFAULT 'pending',
        name              VARCHAR NOT NULL,
        short_description TEXT NOT NULL,
        category          VARCHAR NOT NULL,
        tags              JSONB NOT NULL DEFAULT '[]',
        avatar_media_id   INT,
        zip_media_id      INT NOT NULL,
        skill_md_content  TEXT NOT NULL,
        changelog_note    TEXT,
        submitted_by      INT NOT NULL,
        reviewed_by       INT,
        reviewed_at       TIMESTAMP WITHOUT TIME ZONE,
        reject_reason     TEXT,
        CONSTRAINT fk_skill_versions_package
          FOREIGN KEY (skill_package_id)
          REFERENCES skill_packages (id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_skill_versions_avatar_media
          FOREIGN KEY (avatar_media_id)
          REFERENCES media (id)
          ON DELETE SET NULL,
        CONSTRAINT fk_skill_versions_zip_media
          FOREIGN KEY (zip_media_id)
          REFERENCES media (id)
          ON DELETE RESTRICT
      )
    `);

    // Add circular FK: skill_packages → skill_versions, added after skill_versions exists.
    // ON DELETE SET NULL: the package survives without a live version (re-publishable later).
    await queryRunner.query(`
      ALTER TABLE skill_packages
      ADD CONSTRAINT fk_skill_packages_active_version
        FOREIGN KEY (active_version_id)
        REFERENCES skill_versions (id)
        ON DELETE SET NULL
    `);

    // Partial unique: at most ONE non-soft-deleted pending version per package (C8).
    // is_deleted=false guard ensures a soft-deleted pending row does not freeze the slot.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_skill_versions_one_pending_per_package
      ON skill_versions (skill_package_id)
      WHERE state = 'pending' AND is_deleted = false
    `);

    // Unique (package, version_no): catches concurrent submit races and any version_no collision (H1).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_skill_versions_package_version_no
      ON skill_versions (skill_package_id, version_no)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS uidx_skill_versions_package_version_no');
    await queryRunner.query('DROP INDEX IF EXISTS uidx_skill_versions_one_pending_per_package');
    // Drop circular FK first before dropping tables to avoid constraint errors.
    await queryRunner.query(`
      ALTER TABLE skill_packages
      DROP CONSTRAINT IF EXISTS fk_skill_packages_active_version
    `);
    await queryRunner.query('DROP TABLE IF EXISTS skill_versions CASCADE');
    await queryRunner.query('DROP TABLE IF EXISTS skill_packages CASCADE');
    await queryRunner.query('ALTER TABLE media DROP COLUMN IF EXISTS provider_uid');
  }
}
