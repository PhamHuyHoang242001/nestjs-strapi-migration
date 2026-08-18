import { MigrationInterface, QueryRunner } from 'typeorm';

// Seeds the single permission used by the shared Asset Hub category CRUD API.
// The category table itself remains independent from the permission model.
const MODULE_ID = 104;
const PERMISSION_ID = 116;
const PERMISSION_CODE = 'asset_category_manage';

export class AddAssetCategoryPermission2608181220 implements MigrationInterface {
  name = 'AddAssetCategoryPermission2608181220';

  async up(queryRunner: QueryRunner): Promise<void> {
    const moduleTable = (await queryRunner.hasTable('modules')) ? 'modules' : 'module';
    const permissionTable = (await queryRunner.hasTable('permissions')) ? 'permissions' : 'permission';
    const module = await queryRunner.query(`SELECT id, name FROM "${moduleTable}" WHERE id = $1`, [MODULE_ID]);
    if (module[0] && module[0].name !== 'Asset Hub') {
      throw new Error(`Module id ${MODULE_ID} is not Asset Hub`);
    }
    const existing = await queryRunner.query(`SELECT id, code, module_id FROM "${permissionTable}" WHERE id = $1`, [PERMISSION_ID]);
    if (existing[0] && (existing[0].code !== PERMISSION_CODE || Number(existing[0].module_id) !== MODULE_ID)) {
      throw new Error(`Permission id ${PERMISSION_ID} is already in use`);
    }
    await queryRunner.query(
      `INSERT INTO "${permissionTable}" (id, name, code, method, action, is_active, module_id)
       VALUES ($1, 'Manage Asset Categories', $2, 'CRUD', 'manage', true, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code,
         method = EXCLUDED.method, action = EXCLUDED.action, is_active = true,
         module_id = EXCLUDED.module_id, deleted_at = NULL, is_deleted = false`,
      [PERMISSION_ID, PERMISSION_CODE, MODULE_ID],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const permissionTable = (await queryRunner.hasTable('permissions')) ? 'permissions' : 'permission';
    await queryRunner.query(`DELETE FROM "${permissionTable}" WHERE id = $1 AND code = $2`, [PERMISSION_ID, PERMISSION_CODE]);
  }
}
