import { MigrationInterface, QueryRunner } from 'typeorm';

// Introduces skill_version_files: a table holding per-file metadata (url, name, size, mime,
// kind) for skill-version files that need metadata — currently the zip archive. Replaces the
// inline skill_versions.zip_url column (mirrors the bi_hub_diagnostic_files file-storage model).
//
// The avatar stays a plain inline column (skill_versions.avatar_url, URL only, no metadata) and
// is NOT touched here. Existing zip_url values are backfilled into the new table before the
// column is dropped, so no URL data is lost. Backfilled rows have null name/size/mime (unknown
// for historical uploads); new uploads populate them.
export class CreateSkillVersionFiles2608111600 implements MigrationInterface {
  name = 'CreateSkillVersionFiles2608111600';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS skill_version_files (
        id               SERIAL PRIMARY KEY,
        created_at       TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at       TIMESTAMP WITHOUT TIME ZONE,
        is_deleted       BOOLEAN DEFAULT FALSE,
        skill_version_id INT NOT NULL,
        file_kind        VARCHAR NOT NULL,
        file_url         VARCHAR NOT NULL,
        name             VARCHAR,
        size             INT,
        mime_type        VARCHAR,
        CONSTRAINT fk_skill_version_files_version
          FOREIGN KEY (skill_version_id)
          REFERENCES skill_versions (id)
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_version_files_version
      ON skill_version_files (skill_version_id)
    `);

    // Backfill zip rows from the existing inline column (zip_url is NOT NULL, may be '').
    await queryRunner.query(`
      INSERT INTO skill_version_files (skill_version_id, file_kind, file_url)
      SELECT id, 'zip', zip_url
      FROM skill_versions
      WHERE zip_url IS NOT NULL AND zip_url <> ''
    `);

    // Drop only the zip_url column — the file table now owns the zip. avatar_url stays inline.
    await queryRunner.query(`ALTER TABLE skill_versions DROP COLUMN IF EXISTS zip_url`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the inline zip_url column (nullable first so backfill can populate it).
    // avatar_url was never dropped by up(), so it is left untouched here.
    await queryRunner.query(`ALTER TABLE skill_versions ADD COLUMN IF NOT EXISTS zip_url VARCHAR`);

    // Restore zip_url from the file table (one zip row per version is expected).
    await queryRunner.query(`
      UPDATE skill_versions sv
      SET zip_url = f.file_url
      FROM skill_version_files f
      WHERE f.skill_version_id = sv.id AND f.file_kind = 'zip' AND f.deleted_at IS NULL
    `);

    // Guard: restore the original NOT NULL constraint on zip_url.
    await queryRunner.query(`UPDATE skill_versions SET zip_url = '' WHERE zip_url IS NULL`);
    await queryRunner.query(`ALTER TABLE skill_versions ALTER COLUMN zip_url SET NOT NULL`);

    await queryRunner.query('DROP TABLE IF EXISTS skill_version_files');
  }
}
