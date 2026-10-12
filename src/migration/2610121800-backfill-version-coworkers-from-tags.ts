import { MigrationInterface, QueryRunner } from 'typeorm';

// Copy live *_version_tags → *_version_coworkers by matching ai_hub_tags.name to
// coworker_packages.code or any live coworker_versions.name (case-insensitive).
// Unmatched tags are skipped — leftover catalog stays in ai_hub_tags until ops drops it.
const BACKFILLS: Array<{ joinTable: string; versionColumn: string; tagTable: string; tagFk: string }> = [
  {
    joinTable: 'skill_version_coworkers',
    versionColumn: 'skill_version_id',
    tagTable: 'skill_version_tags',
    tagFk: 'skill_version_id',
  },
  {
    joinTable: 'prompt_version_coworkers',
    versionColumn: 'prompt_version_id',
    tagTable: 'prompt_version_tags',
    tagFk: 'prompt_version_id',
  },
  {
    joinTable: 'api_catalog_version_coworkers',
    versionColumn: 'api_catalog_version_id',
    tagTable: 'api_catalog_version_tags',
    tagFk: 'api_catalog_version_id',
  },
];

export class BackfillVersionCoworkersFromTags2610121800 implements MigrationInterface {
  name = 'BackfillVersionCoworkersFromTags2610121800';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { joinTable, versionColumn, tagTable, tagFk } of BACKFILLS) {
      await queryRunner.query(`
        INSERT INTO ${joinTable} (${versionColumn}, coworker_package_id)
        SELECT DISTINCT vt.${tagFk}, cp.id
        FROM ${tagTable} vt
        INNER JOIN ai_hub_tags t
          ON t.id = vt.tag_id
         AND t.deleted_at IS NULL AND COALESCE(t.is_deleted, false) = false
        INNER JOIN coworker_packages cp
          ON cp.deleted_at IS NULL AND COALESCE(cp.is_deleted, false) = false
         AND (
           LOWER(cp.code) = LOWER(t.name)
           OR EXISTS (
             SELECT 1 FROM coworker_versions cv
             WHERE cv.coworker_package_id = cp.id
               AND cv.deleted_at IS NULL AND COALESCE(cv.is_deleted, false) = false
               AND LOWER(cv.name) = LOWER(t.name)
           )
         )
        WHERE vt.deleted_at IS NULL AND COALESCE(vt.is_deleted, false) = false
          AND NOT EXISTS (
            SELECT 1 FROM ${joinTable} existing
            WHERE existing.${versionColumn} = vt.${tagFk}
              AND existing.coworker_package_id = cp.id
              AND existing.deleted_at IS NULL AND COALESCE(existing.is_deleted, false) = false
          )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { joinTable } of BACKFILLS) {
      await queryRunner.query(`DELETE FROM ${joinTable}`);
    }
  }
}
