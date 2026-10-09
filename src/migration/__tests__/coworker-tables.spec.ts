import type { QueryRunner } from 'typeorm';
import { CreateCoworkerTables2610091700 } from '../2610091700-create-coworker-tables';

function makeQueryRunner(): { runner: QueryRunner; statements: string[] } {
  const statements: string[] = [];
  const query = jest.fn((sql: string): Promise<unknown[]> => {
    statements.push(sql);
    if (sql.includes("path = '/asset-hub/coworker'")) return Promise.resolve([{ id: 210 }]);
    if (sql.includes('COALESCE(MAX(id)')) return Promise.resolve([{ max: 300 }]);
    return Promise.resolve([]);
  });
  return { runner: { query } as unknown as QueryRunner, statements };
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

describe('CreateCoworkerTables2610091700', () => {
  it('creates 6 tables, live unique code, dual-column pending unique, seeds lookup', async () => {
    const harness = makeQueryRunner();
    await new CreateCoworkerTables2610091700().up(harness.runner);
    const sql = harness.statements.map(normalize).join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS coworker_packages');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS coworker_versions');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS coworker_package_responsibles');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS coworker_version_channels');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ai_hub_coworker_channels');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ai_hub_coworker_models');
    expect(sql).toContain('uq_coworker_packages_code_live');
    expect(sql).toContain('uidx_coworker_versions_one_pending_per_package');
    expect(sql).toContain('uidx_coworker_versions_approved_version_no');
    expect(sql).toContain('deleted_at IS NULL AND is_deleted IS NOT TRUE');
    expect(sql).toContain('coworker_upload');
    expect(sql).toContain('coworker_approve');
  });
});
