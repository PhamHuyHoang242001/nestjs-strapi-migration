import { MigrationInterface, QueryRunner } from 'typeorm';

// Drop circular FKs on package.active_version_id. The INT column stays; services join by id.
const DROPS: Array<{ table: string; constraint: string }> = [
  { table: 'skill_packages', constraint: 'fk_skill_packages_active_version' },
  { table: 'prompt_packages', constraint: 'fk_prompt_packages_active_version' },
  { table: 'ai_api_catalog_packages', constraint: 'fk_api_catalog_packages_active_version' },
];

const DOWN_FKS: Array<{ table: string; constraint: string; ref: string }> = [
  { table: 'skill_packages', constraint: 'fk_skill_packages_active_version', ref: 'skill_versions' },
  { table: 'prompt_packages', constraint: 'fk_prompt_packages_active_version', ref: 'prompt_versions' },
  {
    table: 'ai_api_catalog_packages',
    constraint: 'fk_api_catalog_packages_active_version',
    ref: 'ai_api_catalog_versions',
  },
];

export class DropPackageActiveVersionFk2609101500 implements MigrationInterface {
  name = 'DropPackageActiveVersionFk2609101500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, constraint } of DROPS) {
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraint}`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table, constraint, ref } of DOWN_FKS) {
      await queryRunner.query(`
        ALTER TABLE ${table}
        ADD CONSTRAINT ${constraint}
          FOREIGN KEY (active_version_id)
          REFERENCES ${ref} (id)
          ON DELETE SET NULL
      `);
    }
  }
}
