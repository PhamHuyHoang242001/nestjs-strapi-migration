import { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = ['skill_versions', 'prompt_versions', 'api_catalog_versions'] as const;

export class AddAssetHubVersionKind1784990007000 implements MigrationInterface {
  name = 'AddAssetHubVersionKind1784990007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`
        ALTER TABLE ${table}
        ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'personal'
      `);
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS chk_${table}_kind`);
      await queryRunner.query(`
        ALTER TABLE ${table}
        ADD CONSTRAINT chk_${table}_kind CHECK (kind IN ('personal', 'enterprise'))
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS chk_${table}_kind`);
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS kind`);
    }
  }
}
