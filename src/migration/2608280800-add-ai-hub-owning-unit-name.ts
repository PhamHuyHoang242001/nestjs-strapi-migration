import { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = ['skill_packages', 'prompt_packages', 'api_catalog_packages'] as const;

export class AddAiHubOwningUnitName2608280800 implements MigrationInterface {
  name = 'AddAiHubOwningUnitName2608280800';

  async up(q: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await q.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS owning_unit_name varchar(500) NULL`);
    }
  }

  async down(q: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await q.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS owning_unit_name`);
    }
  }
}
