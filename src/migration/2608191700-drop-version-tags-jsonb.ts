import { MigrationInterface, QueryRunner } from 'typeorm';

// Retires the freeform `tags jsonb` array on both version tables. Tags are now rows in
// ai_hub_tags, linked through skill_version_tags / prompt_version_tags, which is what every
// reader and writer uses by the time this runs.
//
// DEPLOY ORDER: this must not run ahead of the code that stopped selecting the column — an older
// build still referencing `av.tags` would 500 on every list, detail and download. Ship the two
// together. The down() restores the column but not its values: the old strings were never
// migrated into the catalog (the catalog is a curated, seeded set), so there is nothing to
// restore them from.
export class DropVersionTagsJsonb2608191700 implements MigrationInterface {
  name = 'DropVersionTagsJsonb2608191700';

  async up(q: QueryRunner): Promise<void> {
    for (const table of ['skill_versions', 'prompt_versions']) {
      await q.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS tags`);
    }
  }

  async down(q: QueryRunner): Promise<void> {
    for (const table of ['skill_versions', 'prompt_versions']) {
      await q.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'`);
    }
  }
}
