import { MigrationInterface, QueryRunner } from 'typeorm';

export class MovePermissionToUserDataAccess2605070900 implements MigrationInterface {
  name = 'MovePermissionToUserDataAccess2605070900';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE data_access_users ADD COLUMN permission_id INT`);

    await queryRunner.query(`
      INSERT INTO data_access_users (user_id, data_access_id, permission_id, created_at, updated_at)
      SELECT DISTINCT dau.user_id, dau.data_access_id, dp.permission_id, NOW(), NOW()
      FROM data_access_users dau
      JOIN data_permissions dp
        ON dp.data_access_id = dau.data_access_id
       AND dp.deleted_at IS NULL
      WHERE dau.deleted_at IS NULL
        AND dau.permission_id IS NULL
    `);

    await queryRunner.query(`DELETE FROM data_access_users WHERE permission_id IS NULL`);

    await queryRunner.query(`ALTER TABLE data_access_users ALTER COLUMN permission_id SET NOT NULL`);

    await queryRunner.query(`
      ALTER TABLE data_access_users
      ADD CONSTRAINT fk_data_access_users_permission
      FOREIGN KEY (permission_id) REFERENCES permission(id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_user_data_access_permission
      ON data_access_users (user_id, data_access_id, permission_id)
      WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX idx_data_access_users_permission
      ON data_access_users (permission_id)
      WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS data_permissions`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE data_permissions (
        id SERIAL PRIMARY KEY,
        permission_id INT NOT NULL REFERENCES permission(id),
        data_access_id INT NOT NULL REFERENCES data_access(id),
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        deleted_at TIMESTAMP WITHOUT TIME ZONE
      )
    `);

    await queryRunner.query(`
      INSERT INTO data_permissions (permission_id, data_access_id, created_at, updated_at)
      SELECT DISTINCT permission_id, data_access_id, NOW(), NOW()
      FROM data_access_users
      WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_data_access_users_permission`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_user_data_access_permission`);
    await queryRunner.query(`ALTER TABLE data_access_users DROP CONSTRAINT IF EXISTS fk_data_access_users_permission`);
    await queryRunner.query(`ALTER TABLE data_access_users DROP COLUMN IF EXISTS permission_id`);
  }
}
