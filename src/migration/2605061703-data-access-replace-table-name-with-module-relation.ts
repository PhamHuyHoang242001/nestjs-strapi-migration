import { MigrationInterface, QueryRunner } from 'typeorm';

export class DataAccessReplaceTableNameWithModuleRelation2605061703 implements MigrationInterface {
  name = 'DataAccessReplaceTableNameWithModuleRelation2605061703';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Add module_id column (nullable initially for data migration)
    await queryRunner.query(`
      ALTER TABLE data_access ADD COLUMN module_id INTEGER
    `);

    // Step 2: Populate module_id from existing table_name by matching modules.table_name
    await queryRunner.query(`
      UPDATE data_access da
      SET module_id = m.id
      FROM modules m
      WHERE m.table_name = da.table_name AND m.deleted_at IS NULL
    `);

    // Step 3: Make module_id NOT NULL (only safe if all rows have been populated)
    await queryRunner.query(`
      ALTER TABLE data_access ALTER COLUMN module_id SET NOT NULL
    `);

    // Step 4: Add FK constraint
    await queryRunner.query(`
      ALTER TABLE data_access
      ADD CONSTRAINT FK_data_access_module
      FOREIGN KEY (module_id) REFERENCES modules(id)
    `);

    // Step 5: Drop old table_name-based indexes and create module_id-based ones
    await queryRunner.query('DROP INDEX IF EXISTS idx_data_access_table_scope');
    await queryRunner.query('DROP INDEX IF EXISTS idx_data_access_table_scope_time');

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_access_module_scope
      ON data_access (module_id, scope_type)
      WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_access_module_scope_time
      ON data_access (module_id, scope_type, start_date, end_date)
      WHERE deleted_at IS NULL
    `);

    // Step 6: Drop old table_name column
    await queryRunner.query(`
      ALTER TABLE data_access DROP COLUMN table_name
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Re-add table_name column
    await queryRunner.query(`
      ALTER TABLE data_access ADD COLUMN table_name VARCHAR
    `);

    // Step 2: Populate table_name from module relation
    await queryRunner.query(`
      UPDATE data_access da
      SET table_name = m.table_name
      FROM modules m
      WHERE m.id = da.module_id
    `);

    // Step 3: Make table_name NOT NULL
    await queryRunner.query(`
      ALTER TABLE data_access ALTER COLUMN table_name SET NOT NULL
    `);

    // Step 4: Restore old indexes
    await queryRunner.query('DROP INDEX IF EXISTS idx_data_access_module_scope');
    await queryRunner.query('DROP INDEX IF EXISTS idx_data_access_module_scope_time');

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_access_table_scope
      ON data_access (table_name, scope_type)
      WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_access_table_scope_time
      ON data_access (table_name, scope_type, start_date, end_date)
      WHERE deleted_at IS NULL
    `);

    // Step 5: Drop FK and module_id column
    await queryRunner.query(`
      ALTER TABLE data_access DROP CONSTRAINT IF EXISTS FK_data_access_module
    `);

    await queryRunner.query(`
      ALTER TABLE data_access DROP COLUMN module_id
    `);
  }
}
