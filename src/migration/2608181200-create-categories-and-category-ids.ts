import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCategoriesAndCategoryIds2608181200 implements MigrationInterface {
  name = 'CreateCategoriesAndCategoryIds2608181200';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, type VARCHAR(20) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_categories_type CHECK (type IN ('skill', 'prompt'))
    )`);
    await q.query('ALTER TABLE skill_versions ADD COLUMN IF NOT EXISTS category_id INT NULL');
    await q.query('ALTER TABLE prompt_versions ADD COLUMN IF NOT EXISTS category_id INT NULL');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE skill_versions DROP COLUMN IF EXISTS category_id');
    await q.query('ALTER TABLE prompt_versions DROP COLUMN IF EXISTS category_id');
    await q.query('DROP TABLE IF EXISTS categories');
  }
}
