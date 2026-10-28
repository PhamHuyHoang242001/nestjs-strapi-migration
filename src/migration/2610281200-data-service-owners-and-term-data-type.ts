import { MigrationInterface, QueryRunner } from 'typeorm';

// - SO dịch vụ: many users per data-service version, a link table like requesters / IT supporters (plain user ids,
//   no FK to users). Existing versions start with none; the form requires at least one on the next edit.
// - Physical terms get data_type (text, required by the form; existing terms stay NULL until edited) and
//   is_required (false unless set).
export class DataServiceOwnersAndTermDataType2610281200 implements MigrationInterface {
  name = 'DataServiceOwnersAndTermDataType2610281200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_data_service_version_service_owners (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        data_service_version_id INT NOT NULL REFERENCES data_hub_data_service_versions(id) ON DELETE CASCADE,
        user_id INT NOT NULL,
        CONSTRAINT uq_data_hub_data_service_version_service_owners_pair UNIQUE (data_service_version_id, user_id)
      )
    `);
    await queryRunner.query(`ALTER TABLE data_hub_physical_terms ADD COLUMN IF NOT EXISTS data_type VARCHAR(100)`);
    await queryRunner.query(
      `ALTER TABLE data_hub_physical_terms ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE data_hub_physical_terms DROP COLUMN IF EXISTS is_required`);
    await queryRunner.query(`ALTER TABLE data_hub_physical_terms DROP COLUMN IF EXISTS data_type`);
    await queryRunner.query(`DROP TABLE IF EXISTS data_hub_data_service_version_service_owners`);
  }
}
