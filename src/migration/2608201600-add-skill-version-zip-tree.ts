import { MigrationInterface, QueryRunner } from 'typeorm';

// Stores the ZIP folder listing captured at skill version submit. Null for rows
// created before this column — no backfill. TypeORM CLI cannot run YYMMDDHHmm
// names; apply this migration manually like the other skill migrations.
export class AddSkillVersionZipTree2608201600 implements MigrationInterface {
  name = 'AddSkillVersionZipTree2608201600';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE skill_versions ADD COLUMN IF NOT EXISTS zip_tree jsonb NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE skill_versions DROP COLUMN IF EXISTS zip_tree`);
  }
}
