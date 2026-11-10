import { MigrationInterface, QueryRunner } from 'typeorm';

const UNITS = 'data_hub_owner_units';
const CONSUMERS = 'data_hub_consumers';

// Đơn vị chủ quản of an App thụ hưởng: its own catalog (name only, unique among live rows ignoring case) instead of
// the shared Khối table. One unit has many apps. Rows are loaded by hand; apps created before keep owner_unit_id
// NULL until reassigned (the API requires it on create/edit). User references are plain INT without FK.
export class ReplaceConsumerDivisionWithOwnerUnit2611101000 implements MigrationInterface {
  name = 'ReplaceConsumerDivisionWithOwnerUnit2611101000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS ${UNITS} (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP WITHOUT TIME ZONE,
        is_deleted BOOLEAN DEFAULT FALSE,
        created_by INT,
        updated_by INT,
        deleted_by INT,
        name VARCHAR(255) NOT NULL
      )`);
    // Case-insensitive uniqueness must also fold Vietnamese letters (Ố, Ậ, Đ…). With a C/POSIX database locale
    // LOWER() only folds ASCII, so use the ICU collation when the server has it.
    const icu = (await queryRunner.query(
      `SELECT EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'und-x-icu') AS ok`,
    )) as Array<{ ok: boolean }>;
    const ci = icu[0]?.ok ? `LOWER(name COLLATE "und-x-icu")` : `LOWER(name)`;
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_${UNITS}_name_live ON ${UNITS} (${ci})
      WHERE deleted_at IS NULL AND is_deleted IS NOT TRUE`);
    await queryRunner.query(`
      ALTER TABLE ${CONSUMERS}
        ADD COLUMN IF NOT EXISTS owner_unit_id INT REFERENCES ${UNITS}(id) ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_${CONSUMERS}_owner_unit_id ON ${CONSUMERS} (owner_unit_id)`);
    // Dropping the column also drops its FK.
    await queryRunner.query(`ALTER TABLE ${CONSUMERS} DROP COLUMN IF EXISTS division_id`);
  }

  // The old Khối links cannot be restored: division_id comes back empty and nullable.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ${CONSUMERS}
        ADD COLUMN IF NOT EXISTS division_id INT REFERENCES data_hub_divisions(id) ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE ${CONSUMERS} DROP COLUMN IF EXISTS owner_unit_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS ${UNITS}`);
  }
}
