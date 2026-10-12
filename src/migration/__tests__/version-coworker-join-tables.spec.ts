import type { QueryRunner } from 'typeorm';
import { CreateVersionCoworkerJoinTables2610121700 } from '../2610121700-create-version-coworker-join-tables';
import { BackfillVersionCoworkersFromTags2610121800 } from '../2610121800-backfill-version-coworkers-from-tags';
import { SkillVersionCoworker } from '../../modules/databases/skill-version-coworker.entity';
import { PromptVersionCoworker } from '../../modules/databases/prompt-version-coworker.entity';
import { ApiVersionCoworker } from '../../modules/databases/api-catalog-version-coworker.entity';

function makeQueryRunner(): { runner: QueryRunner; statements: string[] } {
  const statements: string[] = [];
  const query = jest.fn((sql: string): Promise<unknown[]> => {
    statements.push(sql);
    return Promise.resolve([]);
  });
  return { runner: { query } as unknown as QueryRunner, statements };
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

describe('create version-coworker join tables', () => {
  let statements: string[];

  beforeAll(async () => {
    const harness = makeQueryRunner();
    await new CreateVersionCoworkerJoinTables2610121700().up(harness.runner);
    statements = harness.statements.map(normalize);
  });

  it.each(['skill_version_coworkers', 'prompt_version_coworkers', 'api_catalog_version_coworkers'])(
    'creates %s',
    (table) => {
      expect(statements.some((sql) => sql.includes(`CREATE TABLE IF NOT EXISTS ${table} (`))).toBe(true);
    },
  );

  it('gives every join table soft-delete columns and a FK to coworker_packages', () => {
    const creates = statements.filter((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS'));
    expect(creates).toHaveLength(3);
    for (const sql of creates) {
      expect(sql).toContain('deleted_at TIMESTAMP WITHOUT TIME ZONE');
      expect(sql).toContain('is_deleted BOOLEAN DEFAULT FALSE');
      expect(sql).toContain('coworker_package_id INT NOT NULL REFERENCES coworker_packages(id) ON DELETE RESTRICT');
    }
  });

  it('adds a live unique index on (version_id, coworker_package_id)', () => {
    expect(statements.some((sql) => sql.includes('uq_skill_version_coworkers_live'))).toBe(true);
    expect(statements.some((sql) => sql.includes('uq_prompt_version_coworkers_live'))).toBe(true);
    expect(statements.some((sql) => sql.includes('uq_api_catalog_version_coworkers_live'))).toBe(true);
    for (const sql of statements.filter((s) => s.includes('CREATE UNIQUE INDEX'))) {
      expect(sql).toContain('WHERE deleted_at IS NULL AND is_deleted IS NOT TRUE');
    }
  });

  it('does not drop ai_hub_tags or the old *_version_tags tables', () => {
    expect(statements.some((sql) => sql.includes('DROP TABLE') && sql.includes('ai_hub_tags'))).toBe(false);
    expect(statements.some((sql) => sql.includes('DROP TABLE') && sql.includes('_version_tags'))).toBe(false);
  });
});

describe('create version-coworker join tables — down', () => {
  it('drops the unique indexes then the three tables', async () => {
    const { runner, statements } = makeQueryRunner();
    await new CreateVersionCoworkerJoinTables2610121700().down(runner);
    const normalized = statements.map(normalize);
    expect(normalized.filter((sql) => sql.startsWith('DROP INDEX IF EXISTS'))).toHaveLength(3);
    expect(normalized.filter((sql) => sql.startsWith('DROP TABLE IF EXISTS'))).toHaveLength(3);
  });
});

describe('backfill version-coworkers from tags', () => {
  let statements: string[];

  beforeAll(async () => {
    const harness = makeQueryRunner();
    await new BackfillVersionCoworkersFromTags2610121800().up(harness.runner);
    statements = harness.statements.map(normalize);
  });

  it('copies live tag links into each coworker join table', () => {
    expect(statements.some((sql) => sql.includes('INSERT INTO skill_version_coworkers'))).toBe(true);
    expect(statements.some((sql) => sql.includes('INSERT INTO prompt_version_coworkers'))).toBe(true);
    expect(statements.some((sql) => sql.includes('INSERT INTO api_catalog_version_coworkers'))).toBe(true);
  });

  it('matches tag.name to coworker code or any live version name (case-insensitive)', () => {
    for (const sql of statements) {
      expect(sql).toContain('LOWER(cp.code) = LOWER(t.name)');
      expect(sql).toContain('LOWER(cv.name) = LOWER(t.name)');
    }
  });

  it('skips unmatched tags and existing live links', () => {
    for (const sql of statements) {
      expect(sql).toContain('INNER JOIN coworker_packages cp');
      expect(sql).toContain('AND NOT EXISTS');
    }
  });

  it('sorts after the create-table migration', () => {
    expect('2610121800' > '2610121700').toBe(true);
  });
});

describe('backfill version-coworkers from tags — down', () => {
  it('deletes the backfilled join rows, not the old tag tables', async () => {
    const { runner, statements } = makeQueryRunner();
    await new BackfillVersionCoworkersFromTags2610121800().down(runner);
    const normalized = statements.map(normalize);
    expect(normalized).toEqual([
      'DELETE FROM skill_version_coworkers',
      'DELETE FROM prompt_version_coworkers',
      'DELETE FROM api_catalog_version_coworkers',
    ]);
  });
});

describe('version-coworker entities', () => {
  it.each([
    [SkillVersionCoworker, 'skill_version_coworkers'],
    [PromptVersionCoworker, 'prompt_version_coworkers'],
    [ApiVersionCoworker, 'api_catalog_version_coworkers'],
  ])('maps %p onto %s', (entity, table) => {
    expect(tableNameOf(entity)).toBe(table);
  });
});

type Ctor = new (...args: never[]) => object;

function tableNameOf(entity: Ctor): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
  const { getMetadataArgsStorage } = require('typeorm');
  return getMetadataArgsStorage().tables.find((t: { target: unknown; name?: string }) => t.target === entity)?.name;
}
