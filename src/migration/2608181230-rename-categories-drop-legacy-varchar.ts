import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Finishes the category cutover for DBs that already ran the first draft:
 * rename leftover `categories` → `ai_hub_categories`, add soft-delete columns,
 * and drop the legacy varchar `category` on skill/prompt versions.
 */
export class RenameCategoriesDropLegacyVarchar2608181230 implements MigrationInterface {
  name = 'RenameCategoriesDropLegacyVarchar2608181230';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS ai_hub_categories (
      id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, type VARCHAR(20) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP WITHOUT TIME ZONE,
      is_deleted BOOLEAN DEFAULT FALSE
    )`);
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_hub_categories_type'
        ) THEN
          ALTER TABLE ai_hub_categories
            ADD CONSTRAINT chk_ai_hub_categories_type CHECK (type IN ('skill', 'prompt'));
        END IF;
      END $$;
    `);
    await q.query('ALTER TABLE ai_hub_categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE');
    await q.query('ALTER TABLE ai_hub_categories ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE');

    await q.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'categories'
        ) THEN
          INSERT INTO ai_hub_categories (id, name, type, is_active, created_at, updated_at)
          SELECT id, name, type, is_active, created_at, updated_at FROM categories
          ON CONFLICT (id) DO NOTHING;
          PERFORM setval(
            pg_get_serial_sequence('ai_hub_categories', 'id'),
            COALESCE((SELECT MAX(id) FROM ai_hub_categories), 1),
            true
          );
          DROP TABLE categories;
        END IF;
      END $$;
    `);

    for (const table of ['skill_versions', 'prompt_versions'] as const) {
      if (!(await q.hasColumn(table, 'category'))) continue;
      const type = table === 'skill_versions' ? 'skill' : 'prompt';
      await q.query(`
        INSERT INTO ai_hub_categories (name, type, is_active, is_deleted)
        SELECT MIN(BTRIM(category)), '${type}', true, false
        FROM ${table} WHERE NULLIF(BTRIM(category), '') IS NOT NULL
        GROUP BY LOWER(BTRIM(category))
        HAVING NOT EXISTS (
          SELECT 1 FROM ai_hub_categories c
          WHERE c.type = '${type}' AND LOWER(BTRIM(c.name)) = LOWER(BTRIM(MIN(${table}.category)))
            AND COALESCE(c.is_deleted, false) = false
        )
      `);
      await q.query(`UPDATE ${table} v SET category_id = c.id FROM ai_hub_categories c
        WHERE v.category_id IS NULL AND c.type = '${type}' AND COALESCE(c.is_deleted, false) = false
          AND LOWER(BTRIM(v.category)) = LOWER(c.name)`);
      await q.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS category`);
    }
  }

  async down(q: QueryRunner): Promise<void> {
    for (const table of ['skill_versions', 'prompt_versions'] as const) {
      await q.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS category VARCHAR`);
      await q.query(`UPDATE ${table} v SET category = c.name FROM ai_hub_categories c WHERE v.category_id = c.id`);
    }
  }
}
