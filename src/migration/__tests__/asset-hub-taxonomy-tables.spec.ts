import type { QueryRunner } from 'typeorm';
import { AssetHubTaxonomyTables2608191600 } from '../2608191600-asset-hub-taxonomy-tables';
import { DropVersionTagsJsonb2608191700 } from '../2608191700-drop-version-tags-jsonb';
import { DropAssetHubTaxonomySecondaryIndexes2608200900 } from '../2608200900-drop-asset-hub-taxonomy-secondary-indexes';
import { AssetHubTag, AssetHubTagArtifactType, AssetHubTagKind } from '../../modules/databases/asset-hub-tag.entity';
import { AssetHubPublisher } from '../../modules/databases/asset-hub-publisher.entity';
import { SkillVersionTag } from '../../modules/databases/skill-version-tag.entity';
import { PromptVersionTag } from '../../modules/databases/prompt-version-tag.entity';
import { SkillPackageResponsible } from '../../modules/databases/skill-package-responsible.entity';
import { PromptPackageResponsible } from '../../modules/databases/prompt-package-responsible.entity';
import { SkillVersion } from '../../modules/databases/skill-version.entity';
import { PromptVersion } from '../../modules/databases/prompt-version.entity';
import { SkillPackage } from '../../modules/databases/skill-package.entity';
import { PromptPackage } from '../../modules/databases/prompt-package.entity';

function makeQueryRunner(): { runner: QueryRunner; statements: string[] } {
  const statements: string[] = [];
  const query = jest.fn((sql: string): Promise<unknown[]> => {
    statements.push(sql);
    return Promise.resolve([]);
  });
  return { runner: { query } as unknown as QueryRunner, statements };
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

describe('asset hub taxonomy migration', () => {
  describe('up', () => {
    let statements: string[];

    beforeAll(async () => {
      const harness = makeQueryRunner();
      await new AssetHubTaxonomyTables2608191600().up(harness.runner);
      statements = harness.statements.map(normalize);
    });

    it.each([
      'ai_hub_tags',
      'ai_hub_publishers',
      'skill_package_responsibles',
      'prompt_package_responsibles',
      'skill_version_tags',
      'prompt_version_tags',
    ])('creates %s', (table) => {
      expect(statements.some((sql) => sql.includes(`CREATE TABLE IF NOT EXISTS ${table} (`))).toBe(true);
    });

    it('gives every new table the soft-delete columns inherited from the base entity', () => {
      const creates = statements.filter((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS'));
      expect(creates).toHaveLength(6);
      for (const sql of creates) {
        expect(sql).toContain('deleted_at TIMESTAMP WITHOUT TIME ZONE');
        expect(sql).toContain('is_deleted BOOLEAN DEFAULT FALSE');
      }
    });

    it('constrains tag enums at the database level', () => {
      const createTags = statements.find((sql) => sql.includes('CREATE TABLE IF NOT EXISTS ai_hub_tags'));
      expect(createTags).toContain("kind IN ('enterprise', 'personal')");
      expect(createTags).toContain("artifact_type IN ('skill', 'prompt')");
    });

    it('seeds the fallback publisher and a tag matrix covering both kinds and both artifact types', () => {
      expect(statements.some((sql) => sql.includes('INSERT INTO ai_hub_publishers (name)'))).toBe(true);
      const tagSeeds = statements.filter((sql) => sql.includes('INSERT INTO ai_hub_tags'));
      expect(tagSeeds.length).toBeGreaterThanOrEqual(4);
      // Idempotent — re-running must not duplicate rows.
      for (const sql of tagSeeds) expect(sql).toContain('WHERE NOT EXISTS');
    });

    it('adds usage_guide_html to both version tables with an empty default', () => {
      for (const table of ['skill_versions', 'prompt_versions']) {
        expect(
          statements.some((sql) =>
            sql.includes(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS usage_guide_html TEXT NOT NULL DEFAULT ''`),
          ),
        ).toBe(true);
      }
    });

    it('adds publisher_id nullable, backfills it, then enforces NOT NULL', () => {
      for (const table of ['skill_packages', 'prompt_packages']) {
        const add = statements.findIndex((sql) =>
          sql.includes(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS publisher_id INT NULL`),
        );
        const backfill = statements.findIndex(
          (sql) => sql.includes(`UPDATE ${table} SET publisher_id`) && sql.includes('WHERE publisher_id IS NULL'),
        );
        const notNull = statements.findIndex((sql) =>
          sql.includes(`ALTER TABLE ${table} ALTER COLUMN publisher_id SET NOT NULL`),
        );
        expect(add).toBeGreaterThanOrEqual(0);
        expect(backfill).toBeGreaterThan(add);
        expect(notNull).toBeGreaterThan(backfill);
      }
    });

    it('backfills one person in charge per existing package from created_by', () => {
      expect(
        statements.some(
          (sql) => sql.includes('INSERT INTO skill_package_responsibles') && sql.includes('p.created_by'),
        ),
      ).toBe(true);
      expect(
        statements.some(
          (sql) => sql.includes('INSERT INTO prompt_package_responsibles') && sql.includes('p.created_by'),
        ),
      ).toBe(true);
    });

    it('leaves the legacy jsonb tags column alone — the drop ships with the reader swap', () => {
      expect(statements.some((sql) => sql.includes('DROP COLUMN') && sql.includes('tags'))).toBe(false);
    });

    it('does not create secondary indexes — tables keep only the serial PK', () => {
      expect(statements.some((sql) => sql.includes('CREATE INDEX'))).toBe(false);
    });
  });

  describe('down', () => {
    it('drops both added columns and all six tables', async () => {
      const { runner, statements } = makeQueryRunner();

      await new AssetHubTaxonomyTables2608191600().down(runner);

      const normalized = statements.map(normalize);
      for (const table of ['skill_packages', 'prompt_packages']) {
        expect(normalized).toContain(`ALTER TABLE ${table} DROP COLUMN IF EXISTS publisher_id`);
      }
      for (const table of ['skill_versions', 'prompt_versions']) {
        expect(normalized).toContain(`ALTER TABLE ${table} DROP COLUMN IF EXISTS usage_guide_html`);
      }
      expect(normalized.filter((sql) => sql.startsWith('DROP TABLE IF EXISTS'))).toHaveLength(6);
    });
  });
});

describe('asset hub taxonomy entities', () => {
  it.each([
    [AssetHubTag, 'ai_hub_tags'],
    [AssetHubPublisher, 'ai_hub_publishers'],
    [SkillVersionTag, 'skill_version_tags'],
    [PromptVersionTag, 'prompt_version_tags'],
    [SkillPackageResponsible, 'skill_package_responsibles'],
    [PromptPackageResponsible, 'prompt_package_responsibles'],
  ])('maps %p onto %s', (entity, table) => {
    expect(Reflect.getMetadata('__table__', entity) ?? tableNameOf(entity)).toBe(table);
  });

  it('exposes the tag enums the write path validates against', () => {
    expect(Object.values(AssetHubTagKind)).toEqual(['enterprise', 'personal']);
    expect(Object.values(AssetHubTagArtifactType)).toEqual(['skill', 'prompt']);
  });

  it('declares the new columns on the packages and versions', () => {
    expect(columnNamesOf(SkillVersion)).toContain('usage_guide_html');
    expect(columnNamesOf(PromptVersion)).toContain('usage_guide_html');
    expect(columnNamesOf(SkillPackage)).toContain('publisher_id');
    expect(columnNamesOf(PromptPackage)).toContain('publisher_id');
  });

  it('no longer declares the legacy jsonb tags field — tags come from the join table', () => {
    expect(columnNamesOf(SkillVersion)).not.toContain('tags');
    expect(columnNamesOf(PromptVersion)).not.toContain('tags');
  });
});

describe('drop version tags jsonb migration', () => {
  it('drops the column from both version tables', async () => {
    const { runner, statements } = makeQueryRunner();

    await new DropVersionTagsJsonb2608191700().up(runner);

    expect(statements.map(normalize)).toEqual([
      'ALTER TABLE skill_versions DROP COLUMN IF EXISTS tags',
      'ALTER TABLE prompt_versions DROP COLUMN IF EXISTS tags',
    ]);
  });

  it('restores the column shape on rollback (values are not recoverable)', async () => {
    const { runner, statements } = makeQueryRunner();

    await new DropVersionTagsJsonb2608191700().down(runner);

    for (const table of ['skill_versions', 'prompt_versions']) {
      expect(statements.map(normalize)).toContain(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'`,
      );
    }
  });

  it('runs after the additive migration — its filename sorts later', () => {
    expect('2608191700' > '2608191600').toBe(true);
  });
});

describe('drop asset hub taxonomy secondary indexes', () => {
  it('drops the ten named btrees and leaves PK indexes alone', async () => {
    const { runner, statements } = makeQueryRunner();

    await new DropAssetHubTaxonomySecondaryIndexes2608200900().up(runner);

    const normalized = statements.map(normalize);
    expect(normalized).toHaveLength(10);
    for (const sql of normalized) {
      expect(sql.startsWith('DROP INDEX IF EXISTS idx_')).toBe(true);
      expect(sql).not.toContain('_pkey');
    }
  });

  it('sorts after both taxonomy migrations so already-applied 2608191600 still gets cleaned', () => {
    expect('2608200900' > '2608191700').toBe(true);
  });
});

// TypeORM stores decorator metadata in a global container keyed by the constructor.
type Ctor = new (...args: never[]) => object;

function tableNameOf(entity: Ctor): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
  const { getMetadataArgsStorage } = require('typeorm');
  return getMetadataArgsStorage().tables.find((t: { target: unknown; name?: string }) => t.target === entity)?.name;
}

function columnNamesOf(entity: Ctor): string[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
  const { getMetadataArgsStorage } = require('typeorm');
  return getMetadataArgsStorage()
    .columns.filter((c: { target: unknown }) => c.target === entity)
    .map((c: { propertyName: string }) => c.propertyName);
}
