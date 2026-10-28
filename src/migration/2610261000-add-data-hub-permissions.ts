import { MigrationInterface, QueryRunner } from 'typeorm';

// Seeds the "Data Hub" module and its permission codes. Rows are matched by path/code, never by a fixed id:
// ids are allocated as MAX(id)+1 at run time so the migration cannot collide with other migrations that
// also allocate permission ids, whatever order environments run them in. Re-running is a no-op.
// The module has no table_name, so no owner-implied verbs can ever grant these codes: only explicit role
// grants (and data-access ALLOW exceptions) do, which is what the Data Hub access checks read.
const MODULE_PATH = '/data-hub';
const MODULE_NAME = 'Data Hub';

const PERMISSIONS: Array<[code: string, name: string, method: string, action: string]> = [
  ['dh_consumer_create', 'Create Data Hub consumer', 'POST', 'create'],
  ['dh_consumer_update', 'Update Data Hub consumer', 'PUT', 'update'],
  ['dh_logical_term_create', 'Create logical term', 'POST', 'create'],
  ['dh_logical_term_update', 'Update logical term', 'PUT', 'update'],
  ['dh_data_service_create', 'Create data service', 'POST', 'create'],
  ['dh_data_service_update', 'Update data service', 'PUT', 'update'],
  ['dh_department_view', 'View Data Hub department config', 'GET', 'view'],
  ['dh_department_create', 'Create Data Hub department', 'POST', 'create'],
  ['dh_department_update', 'Update Data Hub department and members', 'PUT', 'update'],
  ['dh_department_delete', 'Delete Data Hub department', 'DELETE', 'delete'],
];
const CODES_SQL = PERMISSIONS.map(([code]) => `'${code}'`).join(', ');

export class AddDataHubPermissions2610261000 implements MigrationInterface {
  name = 'AddDataHubPermissions2610261000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    let [mod] = (await queryRunner.query(
      `SELECT id, table_name FROM modules WHERE path = $1 AND deleted_at IS NULL LIMIT 1`,
      [MODULE_PATH],
    )) as Array<{ id: number; table_name: string | null }>;
    if (mod && mod.table_name) throw new Error(`Module ${MODULE_PATH} must not have a table_name`);
    if (!mod) {
      [mod] = (await queryRunner.query(
        `INSERT INTO modules (id, path, name, table_name, is_active, "parentId", mpath, created_at, updated_at)
         SELECT m.next_id, $1, $2, NULL, true, NULL, m.next_id || '.', NOW(), NOW()
         FROM (SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM modules) m
         RETURNING id, table_name`,
        [MODULE_PATH, MODULE_NAME],
      )) as Array<{ id: number; table_name: string | null }>;
      await queryRunner.query(
        `SELECT setval(pg_get_serial_sequence('modules', 'id'), (SELECT COALESCE(MAX(id), 1) FROM modules))`,
      );
    }
    const moduleId = Number(mod.id);

    for (const [code, name, method, action] of PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO permission (id, name, code, method, action, is_active, module_id)
         SELECT (SELECT COALESCE(MAX(id), 0) + 1 FROM permission), $1, $2::varchar, $3, $4, true, $5
         WHERE NOT EXISTS (SELECT 1 FROM permission WHERE code = $2::varchar)`,
        [name, code, method, action, moduleId],
      );
      // A soft-deleted leftover of the same code is revived instead of duplicated.
      await queryRunner.query(
        `UPDATE permission SET deleted_at = NULL, is_deleted = false, is_active = true, module_id = $2
         WHERE code = $1 AND (deleted_at IS NOT NULL OR is_active = false)`,
        [code, moduleId],
      );
    }
    await queryRunner.query(
      `SELECT setval(pg_get_serial_sequence('permission', 'id'), (SELECT COALESCE(MAX(id), 1) FROM permission))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Grants first, then the codes, then the module when nothing else hangs under it.
    const ids = `SELECT id FROM permission WHERE code IN (${CODES_SQL})`;
    if (await queryRunner.hasTable('data_access_users')) {
      await queryRunner.query(`DELETE FROM data_access_users WHERE permission_id IN (${ids})`);
    }
    if (await queryRunner.hasTable('roles_permissions')) {
      await queryRunner.query(`DELETE FROM roles_permissions WHERE permission_id IN (${ids})`);
    }
    await queryRunner.query(`DELETE FROM permission WHERE code IN (${CODES_SQL})`);
    await queryRunner.query(
      `DELETE FROM modules m WHERE m.path = $1 AND NOT EXISTS (SELECT 1 FROM permission p WHERE p.module_id = m.id)`,
      [MODULE_PATH],
    );
  }
}
