import { MigrationInterface, QueryRunner } from 'typeorm';

const T = 'data_hub_department_members';

// Department members become soft-deleted with full authorship (created_by already exists):
// updated_by, deleted_by, deleted_at, is_deleted. The (department_id, user_id) unique stays: re-adding a removed
// member revives its row instead of inserting a second one.
// `down` hard-deletes the soft-deleted rows first, since without the flag they would read as live members again.
export class SoftDeleteDataHubDepartmentMembers2610311000 implements MigrationInterface {
  name = 'SoftDeleteDataHubDepartmentMembers2610311000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ${T}
         ADD COLUMN IF NOT EXISTS updated_by INT,
         ADD COLUMN IF NOT EXISTS deleted_by INT,
         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE,
         ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM ${T} WHERE deleted_at IS NOT NULL OR is_deleted IS TRUE`);
    await queryRunner.query(
      `ALTER TABLE ${T}
         DROP COLUMN IF EXISTS is_deleted,
         DROP COLUMN IF EXISTS deleted_at,
         DROP COLUMN IF EXISTS deleted_by,
         DROP COLUMN IF EXISTS updated_by`,
    );
  }
}
