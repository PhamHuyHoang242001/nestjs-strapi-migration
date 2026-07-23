import { MigrationInterface, QueryRunner } from 'typeorm';

const NEW_PERMISSION_IDS = '49, 52, 53, 54';
const PERMISSION_TABLE_CANDIDATES = ['permissions', 'permission'] as const;
const ROLE_PERMISSION_TABLE_CANDIDATES = ['role_permissions', 'roles_permissions'] as const;
const EXPECTED_EXISTING_PERMISSIONS = new Map<number, string>([
  [49, 'bp_program_upload'],
  [52, 'bp_program_upload_recon'],
  [53, 'bp_program_approve'],
  [54, 'bp_program_confirm'],
]);

export class AddBiPaymentProgramPermissions1784797200000 implements MigrationInterface {
  name = 'AddBiPaymentProgramPermissions1784797200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const permissionTable = await this.requireSingleTable(queryRunner, PERMISSION_TABLE_CANDIDATES);
    const table = this.quoteIdentifier(permissionTable);
    const existingRows = (await queryRunner.query(
      `SELECT id, code, module_id FROM ${table} WHERE id IN (${NEW_PERMISSION_IDS})`,
    )) as Array<{ id: number; code: string; module_id: number }>;
    for (const row of existingRows) {
      const expectedCode = EXPECTED_EXISTING_PERMISSIONS.get(Number(row.id));
      if (Number(row.module_id) !== 13 || row.code !== expectedCode) {
        throw new Error(
          `Permission id ${row.id} is already used by ${row.code} in module ${row.module_id}; refusing to overwrite`,
        );
      }
    }
    await queryRunner.query(`
      INSERT INTO ${table} (id, name, code, method, action, is_active, module_id)
      VALUES
        (49, 'Upload', 'bp_program_upload', 'POST', 'upload', true, 13),
        (52, 'Upload tra soát', 'bp_program_upload_recon', 'POST', 'upload_recon', true, 13),
        (53, 'Approve', 'bp_program_approve', 'PATCH', 'approve', true, 13),
        (54, 'Confirm', 'bp_program_confirm', 'PATCH', 'confirm', true, 13)
      ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            code = EXCLUDED.code,
            method = EXCLUDED.method,
            action = EXCLUDED.action,
            is_active = true,
            module_id = EXCLUDED.module_id,
            deleted_at = NULL,
            is_deleted = false
    `);
    await this.advanceIdSequence(queryRunner, permissionTable);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const permissionTable = await this.requireSingleTable(queryRunner, PERMISSION_TABLE_CANDIDATES);
    const rolePermissionTable = await this.findSingleTable(queryRunner, ROLE_PERMISSION_TABLE_CANDIDATES);
    if (await queryRunner.hasTable('data_access_users')) {
      await queryRunner.query(`DELETE FROM "data_access_users" WHERE permission_id IN (${NEW_PERMISSION_IDS})`);
    }
    if (rolePermissionTable) {
      await queryRunner.query(
        `DELETE FROM ${this.quoteIdentifier(rolePermissionTable)} WHERE permission_id IN (${NEW_PERMISSION_IDS})`,
      );
    }
    await queryRunner.query(
      `DELETE FROM ${this.quoteIdentifier(permissionTable)} WHERE id IN (${NEW_PERMISSION_IDS}) AND module_id = 13`,
    );
  }

  private async advanceIdSequence(queryRunner: QueryRunner, permissionTable: string): Promise<void> {
    const rows = (await queryRunner.query(`SELECT pg_get_serial_sequence($1, 'id') AS sequence_name`, [
      permissionTable,
    ])) as Array<{ sequence_name?: string | null }>;
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
      throw new Error(`Ambiguous schema; multiple candidate tables exist: ${existing.join(', ')}`);
    }
    return existing[0] ?? null;
  }

  private quoteIdentifier(identifier: string): string {
    if (!/^[a-z_]+$/.test(identifier)) throw new Error(`Unsafe SQL identifier: ${identifier}`);
    return `"${identifier}"`;
  }
}
