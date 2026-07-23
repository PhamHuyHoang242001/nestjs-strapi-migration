import { MigrationInterface, QueryRunner } from 'typeorm';

const LEGACY_PERMISSION_IDS = '43, 44, 45, 46, 47, 48';
const PERMISSION_TABLE_CANDIDATES = ['permissions', 'permission'] as const;
const ROLE_PERMISSION_TABLE_CANDIDATES = ['role_permissions', 'roles_permissions'] as const;

// Deferred intentionally: orm.config only discovers src/migration/** (or its
// compiled dist equivalent). Move this file into that directory in the later
// cleanup release, after manual grants for the new codes pass smoke testing.
export class RemoveLegacyBiPaymentProgramPermissions1784804400000 implements MigrationInterface {
  name = 'RemoveLegacyBiPaymentProgramPermissions1784804400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const permissionTable = await this.requireSingleTable(queryRunner, PERMISSION_TABLE_CANDIDATES);
    const rolePermissionTable = await this.findSingleTable(queryRunner, ROLE_PERMISSION_TABLE_CANDIDATES);
    const permissionIdentifier = this.quoteIdentifier(permissionTable);
    const rows = (await queryRunner.query(
      `SELECT id, module_id FROM ${permissionIdentifier} WHERE id IN (${LEGACY_PERMISSION_IDS})`,
    )) as Array<{ id: number; module_id: number }>;
    const foreignModule = rows.find((row) => Number(row.module_id) !== 13);
    if (foreignModule) {
      throw new Error(`Permission id ${foreignModule.id} belongs to module ${foreignModule.module_id}, expected 13`);
    }

    if (await queryRunner.hasTable('data_access_users')) {
      await queryRunner.query(`DELETE FROM "data_access_users" WHERE permission_id IN (${LEGACY_PERMISSION_IDS})`);
    }
    if (rolePermissionTable) {
      await queryRunner.query(
        `DELETE FROM ${this.quoteIdentifier(rolePermissionTable)} WHERE permission_id IN (${LEGACY_PERMISSION_IDS})`,
      );
    }
    await queryRunner.query(
      `DELETE FROM ${permissionIdentifier} WHERE id IN (${LEGACY_PERMISSION_IDS}) AND module_id = 13`,
    );

    const remaining = (await queryRunner.query(
      `SELECT id FROM ${permissionIdentifier} WHERE id IN (${LEGACY_PERMISSION_IDS})`,
    )) as Array<{ id: number }>;
    if (remaining.length) throw new Error('Legacy BI Payment permissions remain after cleanup');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const permissionTable = await this.requireSingleTable(queryRunner, PERMISSION_TABLE_CANDIDATES);
    await queryRunner.query(`
      INSERT INTO ${this.quoteIdentifier(permissionTable)}
        (id, code, name, method, action, is_active, module_id, is_deleted, deleted_at, created_at, updated_at)
      VALUES
        (43, 'bp_program_next_step', 'Chuyển bước', 'PATCH', 'next_step', true, 13, false, NULL, NOW(), NOW()),
        (44, 'bp_program_preparing', 'Màn Chuẩn bị', 'PATCH', 'preparing', true, 13, false, NULL, NOW(), NOW()),
        (45, 'bp_program_calculating', 'Màn Tính toán', 'PATCH', 'calculating', true, 13, false, NULL, NOW(), NOW()),
        (46, 'bp_program_reconciliation_bicc', 'Màn Tra soát (BICC)', 'PATCH', 'reconciliation_bicc', true, 13, false, NULL, NOW(), NOW()),
        (47, 'bp_program_reconciliation_sale', 'Màn Tra soát (Sale)', 'PATCH', 'reconciliation_sale', true, 13, false, NULL, NOW(), NOW()),
        (48, 'bp_program_confirm_release', 'Màn Confirm + Release', 'PATCH', 'confirm_release', true, 13, false, NULL, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE
        SET code = EXCLUDED.code,
            name = EXCLUDED.name,
            method = EXCLUDED.method,
            action = EXCLUDED.action,
            is_active = true,
            module_id = 13,
            is_deleted = false,
            deleted_at = NULL,
            updated_at = NOW()
    `);
    await this.advanceIdSequence(queryRunner, permissionTable);
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
