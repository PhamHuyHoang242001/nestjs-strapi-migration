import { MigrationInterface, QueryRunner } from 'typeorm';

// 2608191600 already landed secondary btrees on the catalog/join tables. Those
// indexes are not wanted — drop them. PK indexes stay. Idempotent so a DB that
// never had them (fresh apply of the edited 2608191600) is a no-op.
export class DropAssetHubTaxonomySecondaryIndexes2608200900 implements MigrationInterface {
  name = 'DropAssetHubTaxonomySecondaryIndexes2608200900';

  private readonly indexes: ReadonlyArray<{ name: string; table: string; column: string }> = [
    { name: 'idx_ai_hub_tags_artifact_type', table: 'ai_hub_tags', column: 'artifact_type' },
    { name: 'idx_ai_hub_tags_kind', table: 'ai_hub_tags', column: 'kind' },
    { name: 'idx_skill_package_responsibles_skill_package_id', table: 'skill_package_responsibles', column: 'skill_package_id' },
    { name: 'idx_skill_package_responsibles_user_id', table: 'skill_package_responsibles', column: 'user_id' },
    { name: 'idx_prompt_package_responsibles_prompt_package_id', table: 'prompt_package_responsibles', column: 'prompt_package_id' },
    { name: 'idx_prompt_package_responsibles_user_id', table: 'prompt_package_responsibles', column: 'user_id' },
    { name: 'idx_skill_version_tags_skill_version_id', table: 'skill_version_tags', column: 'skill_version_id' },
    { name: 'idx_skill_version_tags_tag_id', table: 'skill_version_tags', column: 'tag_id' },
    { name: 'idx_prompt_version_tags_prompt_version_id', table: 'prompt_version_tags', column: 'prompt_version_id' },
    { name: 'idx_prompt_version_tags_tag_id', table: 'prompt_version_tags', column: 'tag_id' },
  ];

  async up(q: QueryRunner): Promise<void> {
    for (const { name } of this.indexes) {
      await q.query(`DROP INDEX IF EXISTS ${name}`);
    }
  }

  async down(q: QueryRunner): Promise<void> {
    for (const { name, table, column } of this.indexes) {
      await q.query(`CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${column})`);
    }
  }
}
