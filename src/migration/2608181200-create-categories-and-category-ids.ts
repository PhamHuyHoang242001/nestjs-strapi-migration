import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCategoriesAndCategoryIds2608181200 implements MigrationInterface {
  name = 'CreateCategoriesAndCategoryIds2608181200';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS ai_hub_categories (
      id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, type VARCHAR(20) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP WITHOUT TIME ZONE,
      is_deleted BOOLEAN DEFAULT FALSE,
      CONSTRAINT chk_ai_hub_categories_type CHECK (type IN ('skill', 'prompt'))
    )`);
    // Environments that already ran the first draft (table name `categories`) keep their rows.
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
    await q.query('ALTER TABLE skill_versions ADD COLUMN IF NOT EXISTS category_id INT NULL');
    await q.query('ALTER TABLE prompt_versions ADD COLUMN IF NOT EXISTS category_id INT NULL');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE skill_versions DROP COLUMN IF EXISTS category_id');
    await q.query('ALTER TABLE prompt_versions DROP COLUMN IF EXISTS category_id');
    await q.query('DROP TABLE IF EXISTS ai_hub_categories');
    await q.query('DROP TABLE IF EXISTS categories');
  }
}
