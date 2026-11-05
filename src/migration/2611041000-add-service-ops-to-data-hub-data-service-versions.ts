import { MigrationInterface, QueryRunner } from 'typeorm';

const T = 'data_hub_data_service_versions';

// Free-text "Ops dịch vụ" of a data service, optional and versioned like `purpose`.
export class AddServiceOpsToDataHubDataServiceVersions2611041000 implements MigrationInterface {
  name = 'AddServiceOpsToDataHubDataServiceVersions2611041000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ${T} ADD COLUMN IF NOT EXISTS service_ops VARCHAR(2000)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ${T} DROP COLUMN IF EXISTS service_ops`);
  }
}
