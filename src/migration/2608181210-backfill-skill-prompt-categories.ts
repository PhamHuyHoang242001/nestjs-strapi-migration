import { MigrationInterface, QueryRunner } from 'typeorm';

/** Backfills category_id from leftover varchar category values into ai_hub_categories. */
export class BackfillSkillPromptCategories2608181210 implements MigrationInterface {
  name = 'BackfillSkillPromptCategories2608181210';

  async up(q: QueryRunner): Promise<void> {
    const skillHasLegacy = await q.hasColumn('skill_versions', 'category');
    const promptHasLegacy = await q.hasColumn('prompt_versions', 'category');
    if (!skillHasLegacy && !promptHasLegacy) return;

    for (const table of ['skill_versions', 'prompt_versions'] as const) {
      if (!(await q.hasColumn(table, 'category'))) continue;
      const blank = await q.query(
        `SELECT COUNT(*)::int AS count FROM ${table} WHERE category_id IS NULL AND NULLIF(BTRIM(category), '') IS NULL`,
      );
      if (Number(blank[0]?.count) > 0) throw new Error(`Cannot backfill blank categories in ${table}`);
    }

    if (skillHasLegacy) {
      await q.query(`
        INSERT INTO ai_hub_categories (name, type, is_active, is_deleted)
        SELECT MIN(BTRIM(category)), 'skill', true, false
        FROM skill_versions WHERE NULLIF(BTRIM(category), '') IS NOT NULL
        GROUP BY LOWER(BTRIM(category))
        HAVING NOT EXISTS (
          SELECT 1 FROM ai_hub_categories c
          WHERE c.type = 'skill' AND LOWER(BTRIM(c.name)) = LOWER(BTRIM(MIN(skill_versions.category)))
            AND COALESCE(c.is_deleted, false) = false
        )
      `);
      await q.query(`UPDATE skill_versions v SET category_id = c.id FROM ai_hub_categories c
        WHERE v.category_id IS NULL AND c.type = 'skill' AND COALESCE(c.is_deleted, false) = false
          AND LOWER(BTRIM(v.category)) = LOWER(c.name)`);
    }

    if (promptHasLegacy) {
      await q.query(`
        INSERT INTO ai_hub_categories (name, type, is_active, is_deleted)
        SELECT MIN(BTRIM(category)), 'prompt', true, false
        FROM prompt_versions WHERE NULLIF(BTRIM(category), '') IS NOT NULL
        GROUP BY LOWER(BTRIM(category))
        HAVING NOT EXISTS (
          SELECT 1 FROM ai_hub_categories c
          WHERE c.type = 'prompt' AND LOWER(BTRIM(c.name)) = LOWER(BTRIM(MIN(prompt_versions.category)))
            AND COALESCE(c.is_deleted, false) = false
        )
      `);
      await q.query(`UPDATE prompt_versions v SET category_id = c.id FROM ai_hub_categories c
        WHERE v.category_id IS NULL AND c.type = 'prompt' AND COALESCE(c.is_deleted, false) = false
          AND LOWER(BTRIM(v.category)) = LOWER(c.name)`);
    }

    for (const table of ['skill_versions', 'prompt_versions'] as const) {
      if (!(await q.hasColumn(table, 'category'))) continue;
      const remaining = await q.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE category_id IS NULL`);
      if (Number(remaining[0]?.count) > 0) throw new Error(`Unmapped categories remain in ${table}`);
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('UPDATE skill_versions SET category_id = NULL');
    await q.query('UPDATE prompt_versions SET category_id = NULL');
  }
}
