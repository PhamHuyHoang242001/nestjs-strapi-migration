import type { QueryRunner } from 'typeorm';
import { AiHubWorkspaceSoModules2610091600 } from '../2610091600-ai-hub-workspace-so-modules';

function makeQueryRunner(): { runner: QueryRunner; statements: string[] } {
  const statements: string[] = [];
  const query = jest.fn((sql: string, params?: unknown[]): Promise<unknown[]> => {
    statements.push([sql, ...(params ?? [])].join(' '));
    if (sql.includes('SELECT id, mpath FROM modules')) return Promise.resolve([{ id: 104, mpath: '104.' }]);
    if (sql.includes('SELECT id FROM modules WHERE path')) return Promise.resolve([]);
    if (sql.includes('COALESCE(MAX(id)')) return Promise.resolve([{ max: 200 }]);
    if (sql.includes('pg_get_serial_sequence')) return Promise.resolve([{ sequence_name: 'modules_id_seq' }]);
    return Promise.resolve([]);
  });
  return { runner: { query } as unknown as QueryRunner, statements };
}

describe('AiHubWorkspaceSoModules2610091600', () => {
  it('inserts unique child paths and moves perm codes off module 104', async () => {
    const harness = makeQueryRunner();
    await new AiHubWorkspaceSoModules2610091600().up(harness.runner);
    const sql = harness.statements.join('\n');
    expect(sql).toContain('/asset-hub/skill');
    expect(sql).toContain('/asset-hub/prompt');
    expect(sql).toContain('/asset-hub/api-catalog');
    expect(sql).toContain('/asset-hub/coworker');
    expect(sql).toContain('skill_packages');
    expect(sql).toContain('coworker_packages');
    expect(sql).toContain('UPDATE permission SET module_id');
    expect(sql).not.toMatch(/LIKE '%\/asset-hub'/);
  });
});
