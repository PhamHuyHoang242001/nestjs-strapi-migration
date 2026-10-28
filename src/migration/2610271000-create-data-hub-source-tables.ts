import { MigrationInterface, QueryRunner } from 'typeorm';

const LIVE = `deleted_at IS NULL AND is_deleted IS NOT TRUE`;
const OLD_PHYSICAL_CODES = `'dh_physical_term_create', 'dh_physical_term_update', 'dh_physical_term_delete'`;

// Physical terms become owned by one data service and grouped by a source table (Bảng nguồn dịch vụ):
// - data_hub_source_tables: name unique system-wide among live rows (case-insensitive, ICU when available);
//   `link` is reserved and unused for now; department_id is the department of the service that created it.
// - data_hub_physical_terms: physical_column → code (unique only inside one source table), new
//   source_table_id + data_service_id, no status any more (deletion is a soft delete).
// - data_hub_data_service_versions.source_table (free text) is replaced by the source tables of its terms.
// Existing physical terms cannot be attached to a service/table automatically, so they and their version links
// are removed; logical terms keep their own rows and history.
export class CreateDataHubSourceTables2610271000 implements MigrationInterface {
  name = 'CreateDataHubSourceTables2610271000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const icu = (await queryRunner.query(
      `SELECT EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'und-x-icu') AS ok`,
    )) as Array<{ ok: boolean }>;
    const ci = (column: string) => (icu[0]?.ok ? `LOWER(${column} COLLATE "und-x-icu")` : `LOWER(${column})`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_source_tables (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP WITHOUT TIME ZONE,
        is_deleted BOOLEAN DEFAULT FALSE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        link VARCHAR(1000),
        department_id INT NOT NULL REFERENCES data_hub_departments(id) ON DELETE RESTRICT,
        created_by INT NOT NULL,
        updated_by INT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_data_hub_source_tables_name_live
       ON data_hub_source_tables (${ci('name')}) WHERE ${LIVE}`,
    );

    await queryRunner.query('DELETE FROM data_hub_data_service_version_physical_terms');
    await queryRunner.query('DELETE FROM data_hub_physical_terms');

    await queryRunner.query('DROP INDEX IF EXISTS uq_data_hub_physical_terms_column_live');
    await queryRunner.query(
      'ALTER TABLE data_hub_physical_terms DROP CONSTRAINT IF EXISTS ck_data_hub_physical_terms_status',
    );
    await queryRunner.query('ALTER TABLE data_hub_physical_terms DROP COLUMN IF EXISTS status');
    await queryRunner.query(
      `DO $$ BEGIN
         IF EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'data_hub_physical_terms' AND column_name = 'physical_column') THEN
           ALTER TABLE data_hub_physical_terms RENAME COLUMN physical_column TO code;
         END IF;
       END $$`,
    );
    await queryRunner.query('ALTER TABLE data_hub_physical_terms ALTER COLUMN example_value DROP NOT NULL');
    await queryRunner.query(
      `ALTER TABLE data_hub_physical_terms
         ADD COLUMN IF NOT EXISTS source_table_id INT NOT NULL REFERENCES data_hub_source_tables(id) ON DELETE RESTRICT,
         ADD COLUMN IF NOT EXISTS data_service_id INT NOT NULL REFERENCES data_hub_data_services(id) ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_data_hub_physical_terms_table_code_live
       ON data_hub_physical_terms (source_table_id, ${ci('code')}) WHERE ${LIVE}`,
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS ix_data_hub_physical_terms_data_service ON data_hub_physical_terms (data_service_id)',
    );

    await queryRunner.query('ALTER TABLE data_hub_data_service_versions DROP COLUMN IF EXISTS source_table');

    // Physical terms are now written through the data-service form only, so their own codes go away
    // (grants first, then the codes) on databases that already seeded them.
    const ids = `SELECT id FROM permission WHERE code IN (${OLD_PHYSICAL_CODES})`;
    if (await queryRunner.hasTable('data_access_users')) {
      await queryRunner.query(`DELETE FROM data_access_users WHERE permission_id IN (${ids})`);
    }
    if (await queryRunner.hasTable('roles_permissions')) {
      await queryRunner.query(`DELETE FROM roles_permissions WHERE permission_id IN (${ids})`);
    }
    if (await queryRunner.hasTable('permission')) {
      await queryRunner.query(`DELETE FROM permission WHERE code IN (${OLD_PHYSICAL_CODES})`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE data_hub_data_service_versions ADD COLUMN IF NOT EXISTS source_table VARCHAR(1000) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query('DELETE FROM data_hub_data_service_version_physical_terms');
    await queryRunner.query('DELETE FROM data_hub_physical_terms');
    await queryRunner.query('DROP INDEX IF EXISTS ix_data_hub_physical_terms_data_service');
    await queryRunner.query('DROP INDEX IF EXISTS uq_data_hub_physical_terms_table_code_live');
    await queryRunner.query(
      'ALTER TABLE data_hub_physical_terms DROP COLUMN IF EXISTS data_service_id, DROP COLUMN IF EXISTS source_table_id',
    );
    await queryRunner.query('ALTER TABLE data_hub_physical_terms ALTER COLUMN example_value SET NOT NULL');
    await queryRunner.query('ALTER TABLE data_hub_physical_terms RENAME COLUMN code TO physical_column');
    await queryRunner.query(
      `ALTER TABLE data_hub_physical_terms ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_data_hub_physical_terms_column_live
       ON data_hub_physical_terms (LOWER(physical_column)) WHERE ${LIVE}`,
    );
    await queryRunner.query('DROP TABLE IF EXISTS data_hub_source_tables');
  }
}
