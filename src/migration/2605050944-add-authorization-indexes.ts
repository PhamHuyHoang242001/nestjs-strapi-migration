import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthorizationIndexes2605050944 implements MigrationInterface {
  name = 'AddAuthorizationIndexes2605050944';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_roles_user_active
      ON user_roles (user_id)
      WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_roles_permissions_role
      ON roles_permissions (role_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_access_table_scope
      ON data_access (table_name, scope_type)
      WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_access_table_scope_time
      ON data_access (table_name, scope_type, start_date, end_date)
      WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_access_roles_role
      ON data_access_roles (role_id)
      WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_access_users_user
      ON data_access_users (user_id)
      WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_permissions_da
      ON data_permissions (data_access_id)
      WHERE deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_data_permissions_da');
    await queryRunner.query('DROP INDEX IF EXISTS idx_data_access_users_user');
    await queryRunner.query('DROP INDEX IF EXISTS idx_data_access_roles_role');
    await queryRunner.query('DROP INDEX IF EXISTS idx_data_access_table_scope_time');
    await queryRunner.query('DROP INDEX IF EXISTS idx_data_access_table_scope');
    await queryRunner.query('DROP INDEX IF EXISTS idx_roles_permissions_role');
    await queryRunner.query('DROP INDEX IF EXISTS idx_user_roles_user_active');
  }
}
