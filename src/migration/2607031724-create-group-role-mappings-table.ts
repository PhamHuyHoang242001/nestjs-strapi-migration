import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGroupRoleMappingsTable2607031724 implements MigrationInterface {
  name = 'CreateGroupRoleMappingsTable2607031724';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS group_role_mappings (
        id SERIAL PRIMARY KEY,
        type VARCHAR NOT NULL,
        group_role VARCHAR NOT NULL,
        email_user VARCHAR NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_group_role_mappings_group_role
      ON group_role_mappings (group_role)
      WHERE deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_group_role_mappings_group_role');
    await queryRunner.query('DROP TABLE IF EXISTS group_role_mappings CASCADE');
  }
}
