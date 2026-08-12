import { MigrationInterface, QueryRunner } from 'typeorm';

// Seeds two permission codes under the EXISTING Asset Hub module (id=104, created by the
// Skill Package migration 2608111000): prompt_upload (id=114) and prompt_approve (id=115).
// IDs verified non-colliding against live DB (MAX(permission.id)=113 at authoring time 2026-08-12).
//
// The Asset Hub module is upserted (ON CONFLICT DO UPDATE) purely defensively to keep name
// 'Asset Hub' — it is NOT created here. Crucially, down() does NOT delete module 104 because
// the Skill Package feature shares it; only the two prompt_* permission rows are removed.

const MODULE_ID = 104;
const PERMISSION_ID_UPLOAD = 114;
const PERMISSION_ID_APPROVE = 115;
const NEW_PERMISSION_IDS = `${PERMISSION_ID_UPLOAD}, ${PERMISSION_ID_APPROVE}`;

const MODULE_TABLE_CANDIDATES = ['modules', 'module'] as const;
const PERMISSION_TABLE_CANDIDATES = ['permissions', 'permission'] as const;
const ROLE_PERMISSION_TABLE_CANDIDATES = ['role_permissions', 'roles_permissions'] as const;

// Expected code per permission id — used to detect id collisions vs legitimate re-runs.
const EXPECTED_PERMISSIONS = new Map<number, string>([
  [PERMISSION_ID_UPLOAD, 'prompt_upload'],
  [PERMISSION_ID_APPROVE, 'prompt_approve'],
]);

export class AddPromptLibraryPermissions2608121100 implements MigrationInterface {
  name = 'AddPromptLibraryPermissions2608121100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const moduleTable = await this.requireSingleTable(queryRunner, MODULE_TABLE_CANDIDATES);
    const permissionTable = await this.requireSingleTable(queryRunner, PERMISSION_TABLE_CANDIDATES);
    const mt = this.quoteIdentifier(moduleTable);
    const pt = this.quoteIdentifier(permissionTable);

    // Guard: verify module id is not in use by a different module.
    const existingModules = (await queryRunner.query(
      `SELECT id, name FROM ${mt} WHERE id = ${MODULE_ID}`,
    )) as Array<{ id: number; name: string }>;
    for (const row of existingModules) {
      if (row.name !== 'Asset Hub') {
        throw new Error(
          `Module id ${MODULE_ID} is already used by "${row.name}"; refusing to overwrite`,
        );
      }
    }

    // Guard: verify permission ids are not in use by different codes.
    const existingPerms = (await queryRunner.query(
      `SELECT id, code, module_id FROM ${pt} WHERE id IN (${NEW_PERMISSION_IDS})`,
    )) as Array<{ id: number; code: string; module_id: number }>;
    for (const row of existingPerms) {
      const expectedCode = EXPECTED_PERMISSIONS.get(Number(row.id));
      if (Number(row.module_id) !== MODULE_ID || row.code !== expectedCode) {
        throw new Error(
          `Permission id ${row.id} is already used by "${row.code}" in module ${row.module_id}; refusing to overwrite`,
        );
      }
    }

    // Upsert the EXISTING Asset Hub module (created by the Skill Package migration) to keep its
    // name/slug stable. ON CONFLICT (id) DO UPDATE makes this idempotent and safe to re-run.
    await queryRunner.query(`
      INSERT INTO ${mt} (id, path, name, table_name, is_active, "parentId", mpath, created_at, updated_at)
      VALUES (
        ${MODULE_ID},
        '/asset-hub',
        'Asset Hub',
        NULL,
        true,
        NULL,
        '${MODULE_ID}.',
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE
        SET path       = EXCLUDED.path,
            name       = EXCLUDED.name,
            is_active  = true,
            mpath      = EXCLUDED.mpath,
            updated_at = NOW()
    `);

    // Insert two permission codes under the Asset Hub module.
    // prompt_upload: granted to users who may submit new prompt packages/versions.
    // prompt_approve: granted to reviewers who may approve or reject pending versions.
    await queryRunner.query(`
      INSERT INTO ${pt} (id, name, code, method, action, is_active, module_id)
      VALUES
        (${PERMISSION_ID_UPLOAD},  'Upload Prompt',  'prompt_upload',  'POST',  'upload',  true, ${MODULE_ID}),
        (${PERMISSION_ID_APPROVE}, 'Approve Prompt', 'prompt_approve', 'PATCH', 'approve', true, ${MODULE_ID})
      ON CONFLICT (id) DO UPDATE
        SET name      = EXCLUDED.name,
            code      = EXCLUDED.code,
            method    = EXCLUDED.method,
            action    = EXCLUDED.action,
            is_active = true,
            module_id = EXCLUDED.module_id,
            deleted_at  = NULL,
            is_deleted  = false
    `);

    await this.advanceIdSequence(queryRunner, permissionTable);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const permissionTable = await this.requireSingleTable(queryRunner, PERMISSION_TABLE_CANDIDATES);
    const rolePermissionTable = await this.findSingleTable(queryRunner, ROLE_PERMISSION_TABLE_CANDIDATES);
    const pt = this.quoteIdentifier(permissionTable);

    // Remove any role grants and data_access_users rows for these permission codes first.
    if (await queryRunner.hasTable('data_access_users')) {
      await queryRunner.query(
        `DELETE FROM "data_access_users" WHERE permission_id IN (${NEW_PERMISSION_IDS})`,
      );
    }
    if (rolePermissionTable) {
      await queryRunner.query(
        `DELETE FROM ${this.quoteIdentifier(rolePermissionTable)} WHERE permission_id IN (${NEW_PERMISSION_IDS})`,
      );
    }

    // Remove ONLY the two prompt_* permissions. Module 104 (Asset Hub) is intentionally left in
    // place — the Skill Package feature shares it, so deleting it here would break skill perms.
    await queryRunner.query(
      `DELETE FROM ${pt} WHERE id IN (${NEW_PERMISSION_IDS}) AND module_id = ${MODULE_ID}`,
    );
  }

  private async advanceIdSequence(queryRunner: QueryRunner, permissionTable: string): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT pg_get_serial_sequence($1, 'id') AS sequence_name`,
      [permissionTable],
    )) as Array<{ sequence_name?: string | null }>;
    const sequenceName = rows[0]?.sequence_name;
    if (!sequenceName) return;
    await queryRunner.query(
      `SELECT setval($1::regclass, (SELECT COALESCE(MAX(id), 1) FROM ${this.quoteIdentifier(permissionTable)}), true)`,
      [sequenceName],
    );
  }

  private async requireSingleTable(queryRunner: QueryRunner, candidates: readonly string[]): Promise<string> {
    const table = await this.findSingleTable(queryRunner, candidates);
    if (!table) throw new Error(`Missing required table; expected one of: ${candidates.join(', ')}`);
    return table;
  }

  private async findSingleTable(queryRunner: QueryRunner, candidates: readonly string[]): Promise<string | null> {
    const existing: string[] = [];
    for (const candidate of candidates) {
      if (await queryRunner.hasTable(candidate)) existing.push(candidate);
    }
    if (existing.length > 1) {
      throw new Error(`Ambiguous schema: multiple candidate tables exist: ${existing.join(', ')}`);
    }
    return existing[0] ?? null;
  }

  private quoteIdentifier(identifier: string): string {
    if (!/^[a-z_]+$/.test(identifier)) throw new Error(`Unsafe SQL identifier: ${identifier}`);
    return `"${identifier}"`;
  }
}
