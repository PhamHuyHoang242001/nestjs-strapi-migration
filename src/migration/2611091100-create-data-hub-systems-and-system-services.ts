import { MigrationInterface, QueryRunner } from 'typeorm';

const SYSTEMS = 'data_hub_systems';
const SERVICES = 'data_hub_system_services';
const CONSUMERS = 'data_hub_consumers';

const BASE = `
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP WITHOUT TIME ZONE,
        is_deleted BOOLEAN DEFAULT FALSE,
        created_by INT,
        updated_by INT,
        deleted_by INT`;

// Hệ thống -> Dịch vụ hệ thống -> App thụ hưởng. A system has many services; an app belongs to one system
// (required by the API, nullable in the table for apps created before) and at most one service of that system.
// The rows are loaded by hand (no seed). Apps without a system are linked to the first live system when one exists.
// User references are plain INT without FK, like other tables.
export class CreateDataHubSystemsAndSystemServices2611091100 implements MigrationInterface {
  name = 'CreateDataHubSystemsAndSystemServices2611091100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS ${SYSTEMS} (${BASE},
        name VARCHAR(255) NOT NULL
      )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS ${SERVICES} (${BASE},
        system_id INT NOT NULL REFERENCES ${SYSTEMS}(id) ON DELETE RESTRICT,
        name VARCHAR(255) NOT NULL
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_${SERVICES}_system_id ON ${SERVICES} (system_id)`);
    await queryRunner.query(`
      ALTER TABLE ${CONSUMERS}
        ADD COLUMN IF NOT EXISTS system_id INT REFERENCES ${SYSTEMS}(id) ON DELETE RESTRICT,
        ADD COLUMN IF NOT EXISTS system_service_id INT REFERENCES ${SERVICES}(id) ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_${CONSUMERS}_system_id ON ${CONSUMERS} (system_id)`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_${CONSUMERS}_system_service_id ON ${CONSUMERS} (system_service_id)`,
    );
    await queryRunner.query(`
      UPDATE ${CONSUMERS} SET system_id = (
        SELECT s.id FROM ${SYSTEMS} s WHERE s.deleted_at IS NULL AND s.is_deleted IS NOT TRUE ORDER BY s.id LIMIT 1)
      WHERE system_id IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ${CONSUMERS}
        DROP COLUMN IF EXISTS system_service_id,
        DROP COLUMN IF EXISTS system_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS ${SERVICES}`);
    await queryRunner.query(`DROP TABLE IF EXISTS ${SYSTEMS}`);
  }
}
