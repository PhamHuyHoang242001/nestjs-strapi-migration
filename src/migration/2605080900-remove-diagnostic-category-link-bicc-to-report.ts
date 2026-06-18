import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Restructure BI Diagnostic tables:
 * 1. Rename tables: bi_diagnostic_* → bi_hub_diagnostic_*
 * 2. Remove bi_diagnostic_category intermediary
 * 3. Link bicc_department directly to bi_hub_diagnostic_reports (1:N)
 * 4. Update modules tree
 */
export class RemoveDiagnosticCategoryLinkBiccToReport1717833600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Step 1: Rename tables ─────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE IF EXISTS bi_diagnostic_reports RENAME TO bi_hub_diagnostic_reports`);
    await queryRunner.query(`ALTER TABLE IF EXISTS bi_diagnostic_files RENAME TO bi_hub_diagnostic_files`);
    await queryRunner.query(
      `ALTER TABLE IF EXISTS bi_diagnostic_history_reports RENAME TO bi_hub_diagnostic_history_reports`,
    );
    await queryRunner.query(`ALTER TABLE IF EXISTS bi_diagnostic_scopes RENAME TO bi_hub_diagnostic_scopes`);
    await queryRunner.query(
      `ALTER TABLE IF EXISTS bi_diagnostic_reports_scopes RENAME TO bi_hub_diagnostic_reports_scopes`,
    );
    await queryRunner.query(
      `ALTER TABLE IF EXISTS bi_diagnostic_reports_labels RENAME TO bi_hub_diagnostic_reports_labels`,
    );

    // Rename sequences to match new table names
    await queryRunner.query(
      `ALTER SEQUENCE IF EXISTS bi_diagnostic_reports_id_seq RENAME TO bi_hub_diagnostic_reports_id_seq`,
    );
    await queryRunner.query(
      `ALTER SEQUENCE IF EXISTS bi_diagnostic_files_id_seq RENAME TO bi_hub_diagnostic_files_id_seq`,
    );
    await queryRunner.query(
      `ALTER SEQUENCE IF EXISTS bi_diagnostic_history_reports_id_seq RENAME TO bi_hub_diagnostic_history_reports_id_seq`,
    );
    await queryRunner.query(
      `ALTER SEQUENCE IF EXISTS bi_diagnostic_scopes_id_seq RENAME TO bi_hub_diagnostic_scopes_id_seq`,
    );

    // ── Step 2: Remove category, add direct bicc_department FK ──────
    // Add bicc_department_id column
    await queryRunner.query(`
      ALTER TABLE bi_hub_diagnostic_reports
      ADD COLUMN IF NOT EXISTS bicc_department_id integer
    `);

    // Backfill bicc_department_id from category
    await queryRunner.query(`
      UPDATE bi_hub_diagnostic_reports r
      SET bicc_department_id = c.bicc_department_id
      FROM bi_diagnostic_categories c
      WHERE r.bi_diagnostic_category_id = c.id
        AND r.bicc_department_id IS NULL
    `);

    // Drop old category FK and column
    await queryRunner.query(`
      ALTER TABLE bi_hub_diagnostic_reports
      DROP CONSTRAINT IF EXISTS "FK_bi_diagnostic_reports_category"
    `);
    await queryRunner.query(`
      ALTER TABLE bi_hub_diagnostic_reports
      DROP COLUMN IF EXISTS bi_diagnostic_category_id
    `);

    // Add FK constraint for bicc_department_id
    await queryRunner.query(`
      ALTER TABLE bi_hub_diagnostic_reports
      ADD CONSTRAINT "FK_bi_hub_diagnostic_reports_bicc_department"
      FOREIGN KEY (bicc_department_id) REFERENCES bi_hub_bicc_departments(id)
      ON DELETE SET NULL
    `);

    // ── Step 3: Rename FK columns in child tables ───────────────────
    // bi_hub_diagnostic_files: diagnostic_report_id → bi_hub_diagnostic_report_id
    await queryRunner.query(`
      ALTER TABLE bi_hub_diagnostic_files
      RENAME COLUMN diagnostic_report_id TO bi_hub_diagnostic_report_id
    `);

    // bi_hub_diagnostic_history_reports: diagnostic_report_id → bi_hub_diagnostic_report_id
    await queryRunner.query(`
      ALTER TABLE bi_hub_diagnostic_history_reports
      RENAME COLUMN diagnostic_report_id TO bi_hub_diagnostic_report_id
    `);

    // ── Step 4: Update modules tree ─────────────────────────────────
    await queryRunner.query(`
      UPDATE modules SET
        path = '/bi-hub/bicc-department/bi-hub-diagnostic-report',
        name = 'BI Hub Diagnostic Report',
        table_name = 'bi_hub_diagnostic_reports',
        "parentId" = 6,
        mpath = '5.6.8.'
      WHERE id = 8
    `);
    await queryRunner.query(`DELETE FROM modules WHERE id = 9`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse FK column renames
    await queryRunner.query(`
      ALTER TABLE bi_hub_diagnostic_history_reports
      RENAME COLUMN bi_hub_diagnostic_report_id TO diagnostic_report_id
    `);
    await queryRunner.query(`
      ALTER TABLE bi_hub_diagnostic_files
      RENAME COLUMN bi_hub_diagnostic_report_id TO diagnostic_report_id
    `);

    // Restore category column
    await queryRunner.query(`
      ALTER TABLE bi_hub_diagnostic_reports
      ADD COLUMN IF NOT EXISTS bi_diagnostic_category_id integer
    `);
    await queryRunner.query(`
      ALTER TABLE bi_hub_diagnostic_reports
      DROP CONSTRAINT IF EXISTS "FK_bi_hub_diagnostic_reports_bicc_department"
    `);

    // Rename tables back
    await queryRunner.query(`ALTER TABLE IF EXISTS bi_hub_diagnostic_reports RENAME TO bi_diagnostic_reports`);
    await queryRunner.query(`ALTER TABLE IF EXISTS bi_hub_diagnostic_files RENAME TO bi_diagnostic_files`);
    await queryRunner.query(
      `ALTER TABLE IF EXISTS bi_hub_diagnostic_history_reports RENAME TO bi_diagnostic_history_reports`,
    );
    await queryRunner.query(`ALTER TABLE IF EXISTS bi_hub_diagnostic_scopes RENAME TO bi_diagnostic_scopes`);
    await queryRunner.query(
      `ALTER TABLE IF EXISTS bi_hub_diagnostic_reports_scopes RENAME TO bi_diagnostic_reports_scopes`,
    );
    await queryRunner.query(
      `ALTER TABLE IF EXISTS bi_hub_diagnostic_reports_labels RENAME TO bi_diagnostic_reports_labels`,
    );

    // Restore sequences
    await queryRunner.query(
      `ALTER SEQUENCE IF EXISTS bi_hub_diagnostic_reports_id_seq RENAME TO bi_diagnostic_reports_id_seq`,
    );
    await queryRunner.query(
      `ALTER SEQUENCE IF EXISTS bi_hub_diagnostic_files_id_seq RENAME TO bi_diagnostic_files_id_seq`,
    );
    await queryRunner.query(
      `ALTER SEQUENCE IF EXISTS bi_hub_diagnostic_history_reports_id_seq RENAME TO bi_diagnostic_history_reports_id_seq`,
    );
    await queryRunner.query(
      `ALTER SEQUENCE IF EXISTS bi_hub_diagnostic_scopes_id_seq RENAME TO bi_diagnostic_scopes_id_seq`,
    );

    // Restore modules tree
    await queryRunner.query(`
      UPDATE modules SET
        path = '/bi-hub/bicc-department/bi-diagnostic-category',
        name = 'BI Diagnostic Category',
        table_name = 'bi_diagnostic_categories',
        "parentId" = 6,
        mpath = '5.6.8.'
      WHERE id = 8
    `);
    await queryRunner.query(`
      INSERT INTO modules (id, path, name, table_name, is_active, "parentId", mpath, created_at, updated_at)
      VALUES (9, '/bi-hub/bicc-department/bi-diagnostic-category/bi-diagnostic-report', 'BI Diagnostic Report', 'bi_diagnostic_reports', true, 8, '5.6.8.9.', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
  }
}
