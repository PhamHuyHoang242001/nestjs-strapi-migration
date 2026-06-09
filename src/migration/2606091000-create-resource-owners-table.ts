import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateResourceOwnersTable2606091000 implements MigrationInterface {
  name = 'CreateResourceOwnersTable2606091000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS resource_owners (
        id SERIAL PRIMARY KEY,
        resource_type VARCHAR(50) NOT NULL,
        resource_id INT NOT NULL,
        role_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP,
        UNIQUE(resource_type, resource_id, role_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_resource_owners_type_resource
      ON resource_owners (resource_type, resource_id)
      WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_resource_owners_role
      ON resource_owners (role_id)
      WHERE deleted_at IS NULL
    `);

    // Drop old separate owner tables
    await queryRunner.query('DROP TABLE IF EXISTS workspace_owners CASCADE');
    await queryRunner.query('DROP TABLE IF EXISTS bicc_department_owners CASCADE');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_resource_owners_role');
    await queryRunner.query('DROP INDEX IF EXISTS idx_resource_owners_type_resource');
    await queryRunner.query('DROP TABLE IF EXISTS resource_owners CASCADE');
  }
}
