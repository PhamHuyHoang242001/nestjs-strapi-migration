import { AddBiPaymentProgramPermissions1784797200000 } from '../1784797200000-add-bi-payment-program-permissions';
import { AddBiPaymentProgramContentViewPermission1784883600000 } from '../1784883600000-add-bi-payment-program-content-view-permission';
import { RemoveLegacyBiPaymentProgramPermissions1784804400000 } from '../../deferred-migrations/1784804400000-remove-legacy-bi-payment-program-permissions';
import type { QueryRunner } from 'typeorm';

function makeQueryRunner(
  existingTables: string[],
  sequenceName: string | null = null,
  existingPermissions: Array<{ id: number; code: string; module_id: number }> = [],
): { runner: QueryRunner; statements: string[] } {
  const statements: string[] = [];
  const query = jest.fn((sql: string): Promise<unknown[]> => {
    statements.push(sql);
    if (sql.includes('SELECT id, code, module_id')) return Promise.resolve(existingPermissions);
    if (sql.includes('pg_get_serial_sequence')) return Promise.resolve([{ sequence_name: sequenceName }]);
    return Promise.resolve([]);
  });
  return {
    runner: {
      hasTable: jest.fn((table: string): Promise<boolean> => Promise.resolve(existingTables.includes(table))),
      query,
    } as unknown as QueryRunner,
    statements,
  };
}

describe('BI Payment permission migrations', () => {
  it('uses TypeORM-compatible 13-digit migration timestamps', () => {
    expect(new AddBiPaymentProgramPermissions1784797200000().name).toMatch(/\d{13}$/);
    expect(new RemoveLegacyBiPaymentProgramPermissions1784804400000().name).toMatch(/\d{13}$/);
  });

  it('adds the new permissions against the discovered physical table', async () => {
    const { runner, statements } = makeQueryRunner(['permissions'], 'permissions_id_seq');

    await new AddBiPaymentProgramPermissions1784797200000().up(runner);

    expect(statements.some((sql) => sql.includes('INSERT INTO "permissions"'))).toBe(true);
    expect(statements.some((sql) => sql.includes('setval'))).toBe(true);
  });

  it('supports the legacy singular permission table when that is the only physical table', async () => {
    const { runner, statements } = makeQueryRunner(['permission']);

    await new AddBiPaymentProgramPermissions1784797200000().up(runner);

    expect(statements.some((sql) => sql.includes('INSERT INTO "permission"'))).toBe(true);
  });

  it('cleans dependent grants before deleting new permission definitions on rollback', async () => {
    const { runner, statements } = makeQueryRunner(['permissions', 'data_access_users', 'roles_permissions']);

    await new AddBiPaymentProgramPermissions1784797200000().down(runner);

    const userGrantDelete = statements.findIndex((sql) => sql.includes('DELETE FROM "data_access_users"'));
    const roleGrantDelete = statements.findIndex((sql) => sql.includes('DELETE FROM "roles_permissions"'));
    const permissionDelete = statements.findIndex((sql) => sql.includes('DELETE FROM "permissions"'));
    expect(userGrantDelete).toBeGreaterThanOrEqual(0);
    expect(roleGrantDelete).toBeGreaterThanOrEqual(0);
    expect(permissionDelete).toBeGreaterThan(roleGrantDelete);
    expect(permissionDelete).toBeGreaterThan(userGrantDelete);
  });

  it('fails closed when both conflicting permission table names exist', async () => {
    const { runner } = makeQueryRunner(['permission', 'permissions']);

    await expect(new AddBiPaymentProgramPermissions1784797200000().up(runner)).rejects.toThrow('Ambiguous schema');
  });

  it('fails closed instead of overwriting an unrelated permission that already owns a target id', async () => {
    const { runner } = makeQueryRunner(['permissions'], null, [{ id: 49, code: 'custom_permission', module_id: 99 }]);

    await expect(new AddBiPaymentProgramPermissions1784797200000().up(runner)).rejects.toThrow('refusing to overwrite');
  });
});

describe('AddBiPaymentProgramContentViewPermission (id 55)', () => {
  it('uses a TypeORM-compatible 13-digit timestamp that sorts after the base permission add', () => {
    expect(new AddBiPaymentProgramContentViewPermission1784883600000().name).toMatch(/\d{13}$/);
    expect(1784883600000).toBeGreaterThan(1784797200000);
  });

  it('inserts the content-view permission against the discovered physical table', async () => {
    const { runner, statements } = makeQueryRunner(['permissions'], 'permissions_id_seq');

    await new AddBiPaymentProgramContentViewPermission1784883600000().up(runner);

    expect(statements.some((sql) => sql.includes('INSERT INTO "permissions"'))).toBe(true);
    expect(statements.some((sql) => sql.includes('setval'))).toBe(true);
  });

  it('cleans dependent grants before deleting the definition on rollback', async () => {
    const { runner, statements } = makeQueryRunner(['permissions', 'data_access_users', 'roles_permissions']);

    await new AddBiPaymentProgramContentViewPermission1784883600000().down(runner);

    const userGrantDelete = statements.findIndex((sql) => sql.includes('DELETE FROM "data_access_users"'));
    const roleGrantDelete = statements.findIndex((sql) => sql.includes('DELETE FROM "roles_permissions"'));
    const permissionDelete = statements.findIndex((sql) => sql.includes('DELETE FROM "permissions"'));
    expect(permissionDelete).toBeGreaterThan(roleGrantDelete);
    expect(permissionDelete).toBeGreaterThan(userGrantDelete);
  });

  it('fails closed instead of overwriting an unrelated permission that already owns id 55', async () => {
    const { runner } = makeQueryRunner(['permissions'], null, [{ id: 55, code: 'custom_permission', module_id: 99 }]);

    await expect(new AddBiPaymentProgramContentViewPermission1784883600000().up(runner)).rejects.toThrow(
      'refusing to overwrite',
    );
  });
});
