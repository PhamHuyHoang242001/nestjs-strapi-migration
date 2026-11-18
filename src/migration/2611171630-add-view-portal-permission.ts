import { MigrationInterface, QueryRunner } from 'typeorm';

// Seeds the "Portal" module and the view_portal permission that every portal API requires (checked in
// BearerGuard). Rows are matched by path / code and ids are allocated as MAX(id)+1, so the migration never
// collides with other id-allocating migrations. No role is granted here: admins assign it on the web.
// Re-running is a no-op.
const MODULE_PATH = '/portal';
const MODULE_NAME = 'Portal';
const CODE = 'view_portal';

export class AddViewPortalPermission2611171630 implements MigrationInterface {
  name = 'AddViewPortalPermission2611171630';

  public async up(queryRunner: QueryRunner): Promise<void> {
    let [mod] = (await queryRunner.query(`SELECT id FROM modules WHERE path = $1 AND deleted_at IS NULL LIMIT 1`, [
      MODULE_PATH,
    ])) as Array<{ id: number }>;
    if (!mod) {
      [mod] = (await queryRunner.query(
        `INSERT INTO modules (id, path, name, table_name, is_active, "parentId", mpath, created_at, updated_at)
         SELECT m.next_id, $1, $2, NULL, true, NULL, m.next_id || '.', NOW(), NOW()
         FROM (SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM modules) m
         RETURNING id`,
        [MODULE_PATH, MODULE_NAME],
      )) as Array<{ id: number }>;
      await queryRunner.query(
        `SELECT setval(pg_get_serial_sequence('modules', 'id'), (SELECT COALESCE(MAX(id), 1) FROM modules))`,
      );
    }
    const moduleId = Number(mod.id);

    await queryRunner.query(
      `INSERT INTO permission (id, name, code, method, action, is_active, module_id)
       SELECT (SELECT COALESCE(MAX(id), 0) + 1 FROM permission), $1, $2::varchar, 'GET', 'read', true, $3
       WHERE NOT EXISTS (SELECT 1 FROM permission WHERE code = $2::varchar)`,
      ['Truy cập portal', CODE, moduleId],
    );
    // A soft-deleted or disabled leftover of the same code is revived instead of duplicated.
    await queryRunner.query(
      `UPDATE permission SET deleted_at = NULL, is_deleted = false, is_active = true, module_id = $2
       WHERE code = $1 AND (deleted_at IS NOT NULL OR is_active = false)`,
      [CODE, moduleId],
    );
    await queryRunner.query(
      `SELECT setval(pg_get_serial_sequence('permission', 'id'), (SELECT COALESCE(MAX(id), 1) FROM permission))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const ids = `SELECT id FROM permission WHERE code = '${CODE}'`;
    if (await queryRunner.hasTable('data_access_users')) {
      await queryRunner.query(`DELETE FROM data_access_users WHERE permission_id IN (${ids})`);
    }
    if (await queryRunner.hasTable('roles_permissions')) {
      await queryRunner.query(`DELETE FROM roles_permissions WHERE permission_id IN (${ids})`);
    }
    await queryRunner.query(`DELETE FROM permission WHERE code = $1`, [CODE]);
    await queryRunner.query(
      `DELETE FROM modules m WHERE m.path = $1 AND NOT EXISTS (SELECT 1 FROM permission p WHERE p.module_id = m.id)`,
      [MODULE_PATH],
    );
  }
}
