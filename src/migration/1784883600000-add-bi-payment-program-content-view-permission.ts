import { MigrationInterface, QueryRunner } from 'typeorm';

// Read-only full-content view of a program's templates + documents.
// Single code, per-program data_access scoped, module_id 13 (bi-payment program).
const NEW_PERMISSION_ID = 55;
const NEW_PERMISSION_CODE = 'bp_program_content_view';
const PERMISSION_MODULE_ID = 13;
const PERMISSION_TABLE_CANDIDATES = ['permissions', 'permission'] as const;
const ROLE_PERMISSION_TABLE_CANDIDATES = ['role_permissions', 'roles_permissions'] as const;

export class AddBiPaymentProgramContentViewPermission1784883600000 implements MigrationInterface {
  name = 'AddBiPaymentProgramContentViewPermission1784883600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const permissionTable = await this.requireSingleTable(queryRunner, PERMISSION_TABLE_CANDIDATES);
    const table = this.quoteIdentifier(permissionTable);
    const existingRows = (await queryRunner.query(`SELECT id, code, module_id FROM ${table} WHERE id = $1`, [
      NEW_PERMISSION_ID,
    ])) as Array<{ id: number; code: string; module_id: number }>;
    for (const row of existingRows) {
      if (Number(row.module_id) !== PERMISSION_MODULE_ID || row.code !== NEW_PERMISSION_CODE) {
        throw new Error(
          `Permission id ${row.id} is already used by ${row.code} in module ${row.module_id}; refusing to overwrite`,
        );
      }
    }
    await queryRunner.query(
      `
      INSERT INTO ${table} (id, name, code, method, action, is_active, module_id)
      VALUES ($1, $2, $3, 'GET', 'content_view', true, $4)
      ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            code = EXCLUDED.code,
            method = EXCLUDED.method,
            action = EXCLUDED.action,
            is_active = true,
            module_id = EXCLUDED.module_id,
            deleted_at = NULL,
            is_deleted = false
    `,
      [NEW_PERMISSION_ID, 'Xem toàn bộ tài liệu & template', NEW_PERMISSION_CODE, PERMISSION_MODULE_ID],
    );
    await this.advanceIdSequence(queryRunner, permissionTable);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const permissionTable = await this.requireSingleTable(queryRunner, PERMISSION_TABLE_CANDIDATES);
    const rolePermissionTable = await this.findSingleTable(queryRunner, ROLE_PERMISSION_TABLE_CANDIDATES);
    if (await queryRunner.hasTable('data_access_users')) {
      await queryRunner.query(`DELETE FROM "data_access_users" WHERE permission_id = $1`, [NEW_PERMISSION_ID]);
    }
    if (rolePermissionTable) {
      await queryRunner.query(
        `DELETE FROM ${this.quoteIdentifier(rolePermissionTable)} WHERE permission_id = $1`,
        [NEW_PERMISSION_ID],
      );
    }
    await queryRunner.query(
      `DELETE FROM ${this.quoteIdentifier(permissionTable)} WHERE id = $1 AND module_id = $2`,
      [NEW_PERMISSION_ID, PERMISSION_MODULE_ID],
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
