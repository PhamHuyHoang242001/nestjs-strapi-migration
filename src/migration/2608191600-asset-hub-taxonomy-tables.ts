import { MigrationInterface, QueryRunner } from 'typeorm';

// Additive only. Adds the tag/publisher catalogs, the PIC + version-tag join tables, and the
// two new columns (packages.publisher_id, versions.usage_guide_html), then backfills so every
// existing row satisfies the new NOT NULL. The legacy `tags jsonb` column is intentionally left
// in place here — it is dropped by a later migration once no reader depends on it.
export class AssetHubTaxonomyTables2608191600 implements MigrationInterface {
  name = 'AssetHubTaxonomyTables2608191600';

  async up(q: QueryRunner): Promise<void> {
    await this.createCatalogTables(q);
    await this.createJoinTables(q);
    await this.seedCatalogs(q);
    await this.addColumnsAndBackfill(q);
  }

  private async createCatalogTables(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS ai_hub_publishers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP WITHOUT TIME ZONE,
      is_deleted BOOLEAN DEFAULT FALSE
    )`);

    await q.query(`CREATE TABLE IF NOT EXISTS ai_hub_tags (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      kind VARCHAR(20) NOT NULL,
      artifact_type VARCHAR(20) NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP WITHOUT TIME ZONE,
      is_deleted BOOLEAN DEFAULT FALSE,
      CONSTRAINT chk_ai_hub_tags_kind CHECK (kind IN ('enterprise', 'personal')),
      CONSTRAINT chk_ai_hub_tags_artifact_type CHECK (artifact_type IN ('skill', 'prompt'))
    )`);
  }

  private async createJoinTables(q: QueryRunner): Promise<void> {
    const joins: Array<{ table: string; ownerColumn: string; peerColumn: string }> = [
      { table: 'skill_package_responsibles', ownerColumn: 'skill_package_id', peerColumn: 'user_id' },
      { table: 'prompt_package_responsibles', ownerColumn: 'prompt_package_id', peerColumn: 'user_id' },
      { table: 'skill_version_tags', ownerColumn: 'skill_version_id', peerColumn: 'tag_id' },
      { table: 'prompt_version_tags', ownerColumn: 'prompt_version_id', peerColumn: 'tag_id' },
    ];

    for (const { table, ownerColumn, peerColumn } of joins) {
      await q.query(`CREATE TABLE IF NOT EXISTS ${table} (
        id SERIAL PRIMARY KEY,
        ${ownerColumn} INT NOT NULL,
        ${peerColumn} INT NOT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP WITHOUT TIME ZONE,
        is_deleted BOOLEAN DEFAULT FALSE
      )`);
    }
  }

  // Idempotent by name so a re-run on an environment that already seeded adds nothing.
  private async seedCatalogs(q: QueryRunner): Promise<void> {
    const publishers = ['Khác', 'Khối Công nghệ thông tin', 'Khối Ngân hàng số', 'Khối Vận hành', 'Khối Bán lẻ'];
    for (const name of publishers) {
      // Every placeholder is cast explicitly: the same parameter feeds both an INSERT target
      // (varchar) and a comparison, which PostgreSQL otherwise refuses to type-infer (42P08).
      await q.query(
        `INSERT INTO ai_hub_publishers (name)
         SELECT $1::varchar WHERE NOT EXISTS (
           SELECT 1 FROM ai_hub_publishers WHERE name = $1::varchar AND deleted_at IS NULL
         )`,
        [name],
      );
    }

    const tagNames = ['Phân tích dữ liệu', 'Báo cáo', 'Tự động hoá', 'Kiểm thử', 'Tài liệu'];
    for (const artifactType of ['skill', 'prompt']) {
      for (const kind of ['enterprise', 'personal']) {
        for (const name of tagNames) {
          await q.query(
            `INSERT INTO ai_hub_tags (name, kind, artifact_type)
             SELECT $1::varchar, $2::varchar, $3::varchar WHERE NOT EXISTS (
               SELECT 1 FROM ai_hub_tags
               WHERE name = $1::varchar AND kind = $2::varchar AND artifact_type = $3::varchar
                 AND deleted_at IS NULL
             )`,
            [name, kind, artifactType],
          );
        }
      }
    }
  }

  private async addColumnsAndBackfill(q: QueryRunner): Promise<void> {
    // Guide column carries a default so the rewrite fills existing rows in one pass.
    for (const table of ['skill_versions', 'prompt_versions']) {
      await q.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS usage_guide_html TEXT NOT NULL DEFAULT ''`);
    }

    // publisher_id lands nullable, is backfilled to the fallback publisher, then set NOT NULL.
    for (const table of ['skill_packages', 'prompt_packages']) {
      await q.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS publisher_id INT NULL`);
      await q.query(`UPDATE ${table} SET publisher_id = (
        SELECT id FROM ai_hub_publishers WHERE name = 'Khác' AND deleted_at IS NULL ORDER BY id LIMIT 1
      ) WHERE publisher_id IS NULL`);
      await q.query(`ALTER TABLE ${table} ALTER COLUMN publisher_id SET NOT NULL`);
    }

    // Every existing package gets its creator as the initial person in charge.
    await q.query(`INSERT INTO skill_package_responsibles (skill_package_id, user_id)
      SELECT p.id, p.created_by FROM skill_packages p
      WHERE p.created_by IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM skill_package_responsibles r
          WHERE r.skill_package_id = p.id AND r.deleted_at IS NULL
        )`);
    await q.query(`INSERT INTO prompt_package_responsibles (prompt_package_id, user_id)
      SELECT p.id, p.created_by FROM prompt_packages p
      WHERE p.created_by IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM prompt_package_responsibles r
          WHERE r.prompt_package_id = p.id AND r.deleted_at IS NULL
        )`);
  }

  async down(q: QueryRunner): Promise<void> {
    for (const table of ['skill_packages', 'prompt_packages']) {
      await q.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS publisher_id`);
    }
    for (const table of ['skill_versions', 'prompt_versions']) {
      await q.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS usage_guide_html`);
    }
    for (const table of [
      'skill_version_tags',
      'prompt_version_tags',
      'skill_package_responsibles',
      'prompt_package_responsibles',
      'ai_hub_tags',
      'ai_hub_publishers',
    ]) {
      await q.query(`DROP TABLE IF EXISTS ${table}`);
    }
  }
}
