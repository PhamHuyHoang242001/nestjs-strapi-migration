import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop bi_diagnostic_categories table — category layer fully removed.
 * Data already migrated to direct bicc_department FK in previous migration.
 * Also clean up orphaned category permissions (IDs 26-29).
 */
export class DropBiDiagnosticCategoriesTable1717920120000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove category permissions (IDs 26-29)
    await queryRunner.query(`DELETE FROM permissions WHERE id IN (26, 27, 28, 29)`);

    // Drop the table
    await queryRunner.query(`DROP TABLE IF EXISTS bi_diagnostic_categories CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate the table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bi_diagnostic_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR,
        code VARCHAR,
        bicc_department_id INTEGER REFERENCES bi_hub_bicc_departments(id) ON DELETE SET NULL,
        thumbnail VARCHAR,
        category_status VARCHAR DEFAULT 'active',
        is_auto_fill_group_user BOOLEAN DEFAULT false,
        created_by INTEGER,
        updated_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP
      )
    `);

    // Re-insert category permissions
    await queryRunner.query(`
      INSERT INTO permissions (id, code, name, method, action, is_active, module_id, created_at, updated_at)
      VALUES
        (26, 'bh_diag_cat_view', 'Xem', 'GET', 'read', true, 8, NOW(), NOW()),
        (27, 'bh_diag_cat_create', 'Tạo mới', 'POST', 'create', true, 8, NOW(), NOW()),
        (28, 'bh_diag_cat_edit', 'Sửa', 'PUT', 'update', true, 8, NOW(), NOW()),
        (29, 'bh_diag_cat_delete', 'Xóa', 'DELETE', 'delete', true, 8, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
  }
}
