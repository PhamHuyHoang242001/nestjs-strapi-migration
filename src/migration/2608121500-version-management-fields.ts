import { MigrationInterface, QueryRunner } from 'typeorm';

// Version-management redesign schema change (skill + prompt, one atomic release with the lifecycle
// rewrite). Adds:
//   - packages.code       — stable public code `<prefix>_<id>` (PK bijection), stored + backfilled,
//                           NOT NULL, NOT unique-indexed (can never collide → a unique index is dead
//                           weight).
//   - versions.old_version — predecessor approved version_no (NULL for the first-ever version).
//                           version_no stays NOT NULL.
// Constraint swap (per version table): replace the FULL unique (package_id, version_no) with a
// PARTIAL unique scoped to approved rows, because an update-pending version now deliberately shares
// version_no with the live approved row (numbering is finalized only at approve time).
//
// TypeORM runs each migration inside a transaction, so the create-then-drop constraint swap and the
// backfills either all commit or all roll back — the table is never left without uniqueness cover.
// The create-before-drop ordering is kept anyway as defense in depth. IF (NOT) EXISTS guards make
// the whole migration idempotent / self-adjusting.
export class VersionManagementFields2608121500 implements MigrationInterface {
  name = 'VersionManagementFields2608121500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.applyToPair(queryRunner, {
      packageTable: 'skill_packages',
      versionTable: 'skill_versions',
      packageFk: 'skill_package_id',
      codePrefix: 'skill',
      fullUnique: 'uidx_skill_versions_package_version_no',
      partialUnique: 'uidx_skill_versions_approved_version_no',
    });
    await this.applyToPair(queryRunner, {
      packageTable: 'prompt_packages',
      versionTable: 'prompt_versions',
      packageFk: 'prompt_package_id',
      codePrefix: 'prompt',
      fullUnique: 'uidx_prompt_versions_package_version_no',
      partialUnique: 'uidx_prompt_versions_approved_version_no',
    });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.revertPair(queryRunner, {
      packageTable: 'skill_packages',
      versionTable: 'skill_versions',
      fullUnique: 'uidx_skill_versions_package_version_no',
      partialUnique: 'uidx_skill_versions_approved_version_no',
    });
    await this.revertPair(queryRunner, {
      packageTable: 'prompt_packages',
      versionTable: 'prompt_versions',
      fullUnique: 'uidx_prompt_versions_package_version_no',
      partialUnique: 'uidx_prompt_versions_approved_version_no',
    });
  }

  private async applyToPair(
    q: QueryRunner,
    t: {
      packageTable: string;
      versionTable: string;
      packageFk: string;
      codePrefix: string;
      fullUnique: string;
      partialUnique: string;
    },
  ): Promise<void> {
    // 1. code column on the package table (nullable first so existing rows survive the ADD).
    await q.query(`ALTER TABLE ${t.packageTable} ADD COLUMN IF NOT EXISTS code VARCHAR`);

    // 2. old_version on the version table (leave version_no NOT NULL).
    await q.query(`ALTER TABLE ${t.versionTable} ADD COLUMN IF NOT EXISTS old_version INT`);

    // 3. Backfill code = '<prefix>_' || id, then enforce NOT NULL (idempotent re-run: WHERE code IS NULL).
    await q.query(`UPDATE ${t.packageTable} SET code = '${t.codePrefix}_' || id WHERE code IS NULL`);
    await q.query(`ALTER TABLE ${t.packageTable} ALTER COLUMN code SET NOT NULL`);

    // 4. Backfill old_version. Definition matches the Phase-2 runtime write rule so legacy and new
    //    rows never diverge:
    //    - approved rows → version_no of the previous approved non-deleted row (MAX approved
    //      version_no strictly less than this row's version_no, same package). NULL for the first.
    //    - pending/rejected rows → current MAX approved non-deleted version_no of the package (NULL
    //      when the package has no approved version yet).
    // deleted_at IS NULL is included alongside is_deleted so the derivation is byte-for-byte the
    // same "approved non-deleted" set the runtime MAX query uses (upload services), keeping legacy
    // and new old_version values congruent even if a version is ever soft-deleted later.
    await q.query(`
      UPDATE ${t.versionTable} v
      SET old_version = (
        SELECT MAX(v2.version_no) FROM ${t.versionTable} v2
        WHERE v2.${t.packageFk} = v.${t.packageFk}
          AND v2.state = 'approved' AND v2.is_deleted = false AND v2.deleted_at IS NULL
          AND v2.version_no < v.version_no
      )
      WHERE v.state = 'approved'
    `);
    await q.query(`
      UPDATE ${t.versionTable} v
      SET old_version = (
        SELECT MAX(v2.version_no) FROM ${t.versionTable} v2
        WHERE v2.${t.packageFk} = v.${t.packageFk}
          AND v2.state = 'approved' AND v2.is_deleted = false AND v2.deleted_at IS NULL
      )
      WHERE v.state IN ('pending', 'rejected')
    `);

    // 5. Constraint swap. First remediate any legacy duplicate approved (package, version_no) —
    //    they would block the partial-unique — by soft-deleting all but the highest-id row of each
    //    duplicate group. Then CREATE the partial-unique, and only after it exists DROP the full one.
    await q.query(`
      UPDATE ${t.versionTable} v
      SET is_deleted = true, deleted_at = NOW()
      WHERE v.state = 'approved' AND v.is_deleted = false
        AND EXISTS (
          SELECT 1 FROM ${t.versionTable} v2
          WHERE v2.${t.packageFk} = v.${t.packageFk}
            AND v2.version_no = v.version_no
            AND v2.state = 'approved' AND v2.is_deleted = false
            AND v2.id > v.id
        )
    `);
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${t.partialUnique}
      ON ${t.versionTable} (${t.packageFk}, version_no)
      WHERE state = 'approved' AND is_deleted = false
    `);
    await q.query(`DROP INDEX IF EXISTS ${t.fullUnique}`);
  }

  private async revertPair(
    q: QueryRunner,
    t: { packageTable: string; versionTable: string; fullUnique: string; partialUnique: string },
  ): Promise<void> {
    // Restore the full unique before dropping the partial one so the table keeps uniqueness cover.
    // OPS CAVEAT: recreating the FULL unique fails (23505) while any update-pending row still shares
    // version_no with the live approved row — approve/reject all outstanding pending versions before
    // rolling back this migration.
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${t.fullUnique}
      ON ${t.versionTable} (${t.versionTable === 'skill_versions' ? 'skill_package_id' : 'prompt_package_id'}, version_no)
    `);
    await q.query(`DROP INDEX IF EXISTS ${t.partialUnique}`);
    await q.query(`ALTER TABLE ${t.versionTable} DROP COLUMN IF EXISTS old_version`);
    await q.query(`ALTER TABLE ${t.packageTable} DROP COLUMN IF EXISTS code`);
  }
}
