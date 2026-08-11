import { MigrationInterface, QueryRunner } from 'typeorm';

// Switch skill_versions to store the Strapi file URL directly on the row, mirroring the
// diagnostic file-storage model (bi_hub_diagnostic_files.file_url). The shared `media`
// table indirection (zip_media_id / avatar_media_id FKs) is removed: the client uploads to
// Strapi and we persist the returned URL as-sent. The zip is still fetched from zip_url at
// submit time to unzip/validate/extract skill.md — only the URL is stored afterwards.
//
// Existing rows are backfilled from media.path before the old columns are dropped, so no
// URL data is lost when a skill version already exists.
export class SkillVersionsStoreUrlDirectly2608111500 implements MigrationInterface {
  name = 'SkillVersionsStoreUrlDirectly2608111500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add the new URL columns (nullable first so backfill can populate them).
    await queryRunner.query(`ALTER TABLE skill_versions ADD COLUMN IF NOT EXISTS zip_url VARCHAR`);
    await queryRunner.query(`ALTER TABLE skill_versions ADD COLUMN IF NOT EXISTS avatar_url VARCHAR`);

    // Backfill from the linked media rows for any pre-existing versions.
    await queryRunner.query(`
      UPDATE skill_versions sv
      SET zip_url = m.path
      FROM media m
      WHERE sv.zip_media_id = m.id AND sv.zip_url IS NULL
    `);
    await queryRunner.query(`
      UPDATE skill_versions sv
      SET avatar_url = m.path
      FROM media m
      WHERE sv.avatar_media_id = m.id AND sv.avatar_url IS NULL
    `);

    // Guard: any row that still has no zip_url (orphaned media) gets an empty string so the
    // NOT NULL constraint can be applied without failing. Should not occur in practice.
    await queryRunner.query(`UPDATE skill_versions SET zip_url = '' WHERE zip_url IS NULL`);
    await queryRunner.query(`ALTER TABLE skill_versions ALTER COLUMN zip_url SET NOT NULL`);

    // Drop the media FKs + columns that are no longer referenced.
    await queryRunner.query(`ALTER TABLE skill_versions DROP CONSTRAINT IF EXISTS fk_skill_versions_zip_media`);
    await queryRunner.query(`ALTER TABLE skill_versions DROP CONSTRAINT IF EXISTS fk_skill_versions_avatar_media`);
    await queryRunner.query(`ALTER TABLE skill_versions DROP COLUMN IF EXISTS zip_media_id`);
    await queryRunner.query(`ALTER TABLE skill_versions DROP COLUMN IF EXISTS avatar_media_id`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the media FK columns (nullable — original zip_media_id was NOT NULL, but the
    // referenced media rows may no longer exist, so we relax it here for a clean revert).
    await queryRunner.query(`ALTER TABLE skill_versions ADD COLUMN IF NOT EXISTS zip_media_id INT`);
    await queryRunner.query(`ALTER TABLE skill_versions ADD COLUMN IF NOT EXISTS avatar_media_id INT`);
    await queryRunner.query(`
      ALTER TABLE skill_versions
      ADD CONSTRAINT fk_skill_versions_zip_media
        FOREIGN KEY (zip_media_id) REFERENCES media (id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE skill_versions
      ADD CONSTRAINT fk_skill_versions_avatar_media
        FOREIGN KEY (avatar_media_id) REFERENCES media (id) ON DELETE SET NULL
    `);

    await queryRunner.query(`ALTER TABLE skill_versions DROP COLUMN IF EXISTS zip_url`);
    await queryRunner.query(`ALTER TABLE skill_versions DROP COLUMN IF EXISTS avatar_url`);
  }
}
