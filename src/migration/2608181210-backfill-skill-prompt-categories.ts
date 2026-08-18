import { MigrationInterface, QueryRunner } from 'typeorm';

/** Backfills the new IDs while retaining legacy category text for rollback/audit. */
export class BackfillSkillPromptCategories2608181210 implements MigrationInterface {
  name = 'BackfillSkillPromptCategories2608181210';

  async up(q: QueryRunner): Promise<void> {
    for (const table of ['skill_versions', 'prompt_versions']) {
      const blank = await q.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE category_id IS NULL AND NULLIF(BTRIM(category), '') IS NULL`);
      if (Number(blank[0]?.count) > 0) throw new Error(`Cannot backfill blank categories in ${table}`);
    }
    await q.query(`
      INSERT INTO categories (name, type, is_active)
      SELECT MIN(BTRIM(category)), 'skill', true
      FROM skill_versions WHERE NULLIF(BTRIM(category), '') IS NOT NULL
      GROUP BY LOWER(BTRIM(category))
      HAVING NOT EXISTS (SELECT 1 FROM categories c WHERE c.type = 'skill' AND LOWER(BTRIM(c.name)) = LOWER(BTRIM(MIN(skill_versions.category))))
    `);
    await q.query(`
      INSERT INTO categories (name, type, is_active)
      SELECT MIN(BTRIM(category)), 'prompt', true
      FROM prompt_versions WHERE NULLIF(BTRIM(category), '') IS NOT NULL
      GROUP BY LOWER(BTRIM(category))
      HAVING NOT EXISTS (SELECT 1 FROM categories c WHERE c.type = 'prompt' AND LOWER(BTRIM(c.name)) = LOWER(BTRIM(MIN(prompt_versions.category))))
    `);
    await q.query(`UPDATE skill_versions v SET category_id = c.id FROM categories c
      WHERE v.category_id IS NULL AND c.type = 'skill' AND LOWER(BTRIM(v.category)) = LOWER(c.name)`);
    await q.query(`UPDATE prompt_versions v SET category_id = c.id FROM categories c
      WHERE v.category_id IS NULL AND c.type = 'prompt' AND LOWER(BTRIM(v.category)) = LOWER(c.name)`);
    for (const table of ['skill_versions', 'prompt_versions']) {
      const remaining = await q.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE category_id IS NULL`);
      if (Number(remaining[0]?.count) > 0) throw new Error(`Unmapped categories remain in ${table}`);
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('UPDATE skill_versions SET category_id = NULL');
    await q.query('UPDATE prompt_versions SET category_id = NULL');
  }
}
