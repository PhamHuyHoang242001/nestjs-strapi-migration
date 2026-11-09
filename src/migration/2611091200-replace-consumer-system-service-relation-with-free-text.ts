import { MigrationInterface, QueryRunner } from 'typeorm';

const CONSUMERS = 'data_hub_consumers';
const SERVICES = 'data_hub_system_services';

// Dịch vụ hệ thống of an App thụ hưởng becomes free text typed by the user: the system_service_id relation and the
// Dịch vụ hệ thống catalog are dropped. Names already linked are copied into the new column.
export class ReplaceConsumerSystemServiceRelationWithFreeText2611091200 implements MigrationInterface {
  name = 'ReplaceConsumerSystemServiceRelationWithFreeText2611091200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ${CONSUMERS} ADD COLUMN IF NOT EXISTS system_service VARCHAR(255)`);
    if (await queryRunner.hasColumn(CONSUMERS, 'system_service_id')) {
      await queryRunner.query(`
        UPDATE ${CONSUMERS} c SET system_service = sv.name
        FROM ${SERVICES} sv WHERE sv.id = c.system_service_id AND c.system_service IS NULL`);
    }
    // Dropping the column also drops its FK and index.
    await queryRunner.query(`ALTER TABLE ${CONSUMERS} DROP COLUMN IF EXISTS system_service_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS ${SERVICES}`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS ${SERVICES} (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP WITHOUT TIME ZONE,
        is_deleted BOOLEAN DEFAULT FALSE,
        created_by INT,
        updated_by INT,
        deleted_by INT,
        system_id INT NOT NULL REFERENCES data_hub_systems(id) ON DELETE RESTRICT,
        name VARCHAR(255) NOT NULL
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_${SERVICES}_system_id ON ${SERVICES} (system_id)`);
    await queryRunner.query(`
      ALTER TABLE ${CONSUMERS}
        ADD COLUMN IF NOT EXISTS system_service_id INT REFERENCES ${SERVICES}(id) ON DELETE RESTRICT`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_${CONSUMERS}_system_service_id ON ${CONSUMERS} (system_service_id)`,
    );
    await queryRunner.query(`ALTER TABLE ${CONSUMERS} DROP COLUMN IF EXISTS system_service`);
  }
}
