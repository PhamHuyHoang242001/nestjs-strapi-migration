import { MigrationInterface, QueryRunner } from 'typeorm';

const JOINS: Array<{ table: string; versionColumn: string; uq: string }> = [
  { table: 'skill_version_coworkers', versionColumn: 'skill_version_id', uq: 'uq_skill_version_coworkers_live' },
  { table: 'prompt_version_coworkers', versionColumn: 'prompt_version_id', uq: 'uq_prompt_version_coworkers_live' },
  {
    table: 'api_catalog_version_coworkers',
    versionColumn: 'api_catalog_version_id',
    uq: 'uq_api_catalog_version_coworkers_live',
  },
];

export class CreateVersionCoworkerJoinTables2610121700 implements MigrationInterface {
  name = 'CreateVersionCoworkerJoinTables2610121700';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, versionColumn, uq } of JOINS) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at TIMESTAMP WITHOUT TIME ZONE,
          is_deleted BOOLEAN DEFAULT FALSE,
          ${versionColumn} INT NOT NULL,
          coworker_package_id INT NOT NULL REFERENCES coworker_packages(id) ON DELETE RESTRICT
        )
      `);
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS ${uq}
        ON ${table} (${versionColumn}, coworker_package_id)
        WHERE deleted_at IS NULL AND is_deleted IS NOT TRUE
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table, uq } of [...JOINS].reverse()) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${uq}`);
      await queryRunner.query(`DROP TABLE IF EXISTS ${table}`);
    }
  }
}
