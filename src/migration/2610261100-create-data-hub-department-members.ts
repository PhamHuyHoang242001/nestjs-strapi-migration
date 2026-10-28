import { MigrationInterface, QueryRunner } from 'typeorm';

const LIVE = `deleted_at IS NULL AND is_deleted IS NOT TRUE`;

// Department config for Data Hub:
// - data_hub_department_members: users allowed to create/update data services of a department (Đơn vị phát
//   hành). One user may belong to many departments. user_id is a plain INT like other user references; links
//   are hard-deleted on removal.
// - department code becomes unique case-insensitively among live rows (was case-sensitive), using the ICU
//   collation when available so Vietnamese letters fold too. The migration refuses to run while live codes
//   already collide that way, listing them, instead of failing inside CREATE INDEX.
// - created_by / updated_by on departments, nullable because seeded rows have no author.
export class CreateDataHubDepartmentMembers2610261100 implements MigrationInterface {
  name = 'CreateDataHubDepartmentMembers2610261100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const icu = (await queryRunner.query(
      `SELECT EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'und-x-icu') AS ok`,
    )) as Array<{ ok: boolean }>;
    const ci = icu[0]?.ok ? `LOWER(code COLLATE "und-x-icu")` : `LOWER(code)`;

    const clashes = (await queryRunner.query(
      `SELECT string_agg(code, ', ' ORDER BY code) AS codes FROM data_hub_departments
       WHERE ${LIVE} GROUP BY ${ci} HAVING COUNT(*) > 1`,
    )) as Array<{ codes: string }>;
    if (clashes.length > 0) {
      throw new Error(`Department codes differ only by case: ${clashes.map((c) => c.codes).join(' | ')}`);
    }
    await queryRunner.query(`DROP INDEX IF EXISTS uq_data_hub_departments_code_live`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_data_hub_departments_code_live ON data_hub_departments (${ci}) WHERE ${LIVE}`,
    );

    await queryRunner.query(`ALTER TABLE data_hub_departments ADD COLUMN IF NOT EXISTS created_by INT`);
    await queryRunner.query(`ALTER TABLE data_hub_departments ADD COLUMN IF NOT EXISTS updated_by INT`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_department_members (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        department_id INT NOT NULL REFERENCES data_hub_departments(id) ON DELETE CASCADE,
        user_id INT NOT NULL,
        created_by INT,
        CONSTRAINT uq_data_hub_department_members_pair UNIQUE (department_id, user_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_data_hub_department_members_user ON data_hub_department_members (user_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS data_hub_department_members`);
    await queryRunner.query(`ALTER TABLE data_hub_departments DROP COLUMN IF EXISTS updated_by`);
    await queryRunner.query(`ALTER TABLE data_hub_departments DROP COLUMN IF EXISTS created_by`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_data_hub_departments_code_live`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_data_hub_departments_code_live ON data_hub_departments (code) WHERE ${LIVE}`,
    );
  }
}
