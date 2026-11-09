import { MigrationInterface, QueryRunner } from 'typeorm';

const VERSIONS = 'data_hub_data_service_versions';
const OLD_LINKS = 'data_hub_data_service_version_it_supporters';

// IT hỗ trợ becomes free contact info on the version: JSON { email, phone, link } (email/phone are `; `-separated
// lists, link is one URL), replacing the per-version user link table. Old user links are dropped, not converted.
// `down` restores the empty link table only; the JSON values are lost.
export class ReplaceDataServiceItSupportersWithItSupportJson2611091000 implements MigrationInterface {
  name = 'ReplaceDataServiceItSupportersWithItSupportJson2611091000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ${VERSIONS} ADD COLUMN IF NOT EXISTS it_support JSONB`);
    await queryRunner.query(`DROP TABLE IF EXISTS ${OLD_LINKS}`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${OLD_LINKS} (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        data_service_version_id INT NOT NULL REFERENCES ${VERSIONS}(id) ON DELETE CASCADE,
        user_id INT NOT NULL,
        CONSTRAINT uq_data_hub_data_service_version_it_supporters_pair UNIQUE (data_service_version_id, user_id)
      )
    `);
    await queryRunner.query(`ALTER TABLE ${VERSIONS} DROP COLUMN IF EXISTS it_support`);
  }
}
