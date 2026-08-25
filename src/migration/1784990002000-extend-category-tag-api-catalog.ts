import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendCategoryTagApiCatalog1784990002000 implements MigrationInterface {
  name = 'ExtendCategoryTagApiCatalog1784990002000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE ai_hub_categories DROP CONSTRAINT IF EXISTS chk_ai_hub_categories_type`);
    await q.query(
      `ALTER TABLE ai_hub_categories ADD CONSTRAINT chk_ai_hub_categories_type CHECK (type IN ('skill', 'prompt', 'api-catalog'))`,
    );

    await q.query(`ALTER TABLE ai_hub_tags DROP CONSTRAINT IF EXISTS chk_ai_hub_tags_artifact_type`);
    await q.query(
      `ALTER TABLE ai_hub_tags ADD CONSTRAINT chk_ai_hub_tags_artifact_type CHECK (artifact_type IN ('skill', 'prompt', 'api-catalog'))`,
    );

    const tagNames = ['Phân tích dữ liệu', 'Báo cáo', 'Tự động hoá', 'Kiểm thử', 'Tài liệu'];
    for (const kind of ['enterprise', 'personal']) {
      for (const name of tagNames) {
        await q.query(
          `INSERT INTO ai_hub_tags (name, kind, artifact_type)
           SELECT $1::varchar, $2::varchar, $3::varchar WHERE NOT EXISTS (
             SELECT 1 FROM ai_hub_tags
             WHERE name = $1::varchar AND kind = $2::varchar AND artifact_type = $3::varchar
               AND deleted_at IS NULL
           )`,
          [name, kind, 'api-catalog'],
        );
      }
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM ai_hub_tags WHERE artifact_type = 'api-catalog'`);
    await q.query(`ALTER TABLE ai_hub_tags DROP CONSTRAINT IF EXISTS chk_ai_hub_tags_artifact_type`);
    await q.query(
      `ALTER TABLE ai_hub_tags ADD CONSTRAINT chk_ai_hub_tags_artifact_type CHECK (artifact_type IN ('skill', 'prompt'))`,
    );
    await q.query(`ALTER TABLE ai_hub_categories DROP CONSTRAINT IF EXISTS chk_ai_hub_categories_type`);
    await q.query(
      `ALTER TABLE ai_hub_categories ADD CONSTRAINT chk_ai_hub_categories_type CHECK (type IN ('skill', 'prompt'))`,
    );
  }
}
