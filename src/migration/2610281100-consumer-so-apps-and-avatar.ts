import { MigrationInterface, QueryRunner } from 'typeorm';

// App thụ hưởng (data_hub_consumers):
// - "Đầu mối liên hệ nghiệp vụ" becomes "SO APP": the many-users link table is renamed with its sequence,
//   primary key, foreign key and pair constraint, keeping every link; the key in stored history snapshots is renamed too.
// - "Phòng ban" is dropped (column and its FK); old history snapshots keep their department_id as recorded.
// - avatar_url: nullable URL of the uploaded avatar image (same as the other avatar_url columns).
export class ConsumerSoAppsAndAvatar2610281100 implements MigrationInterface {
  name = 'ConsumerSoAppsAndAvatar2610281100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE data_hub_consumer_business_contacts RENAME TO data_hub_consumer_so_apps`);
    await queryRunner.query(
      `ALTER SEQUENCE IF EXISTS data_hub_consumer_business_contacts_id_seq RENAME TO data_hub_consumer_so_apps_id_seq`,
    );
    await queryRunner.query(
      `ALTER TABLE data_hub_consumer_so_apps
         RENAME CONSTRAINT data_hub_consumer_business_contacts_pkey TO data_hub_consumer_so_apps_pkey`,
    );
    await queryRunner.query(
      `ALTER TABLE data_hub_consumer_so_apps
         RENAME CONSTRAINT uq_data_hub_consumer_business_contacts_pair TO uq_data_hub_consumer_so_apps_pair`,
    );
    await queryRunner.query(
      `ALTER TABLE data_hub_consumer_so_apps
         RENAME CONSTRAINT data_hub_consumer_business_contacts_consumer_id_fkey TO data_hub_consumer_so_apps_consumer_id_fkey`,
    );
    await queryRunner.query(
      `UPDATE data_hub_consumer_histories
       SET snapshot = (snapshot - 'business_contact_user_ids')
                      || jsonb_build_object('so_app_user_ids', snapshot->'business_contact_user_ids')
       WHERE snapshot ? 'business_contact_user_ids'`,
    );

    await queryRunner.query(`ALTER TABLE data_hub_consumers DROP COLUMN IF EXISTS department_id`);
    await queryRunner.query(`ALTER TABLE data_hub_consumers ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(2000)`);
  }

  // The dropped departments cannot be restored: department_id comes back empty.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE data_hub_consumers DROP COLUMN IF EXISTS avatar_url`);
    await queryRunner.query(
      `ALTER TABLE data_hub_consumers
         ADD COLUMN IF NOT EXISTS department_id INT REFERENCES data_hub_departments(id) ON DELETE RESTRICT`,
    );

    await queryRunner.query(
      `UPDATE data_hub_consumer_histories
       SET snapshot = (snapshot - 'so_app_user_ids')
                      || jsonb_build_object('business_contact_user_ids', snapshot->'so_app_user_ids')
       WHERE snapshot ? 'so_app_user_ids'`,
    );
    await queryRunner.query(
      `ALTER TABLE data_hub_consumer_so_apps
         RENAME CONSTRAINT data_hub_consumer_so_apps_consumer_id_fkey TO data_hub_consumer_business_contacts_consumer_id_fkey`,
    );
    await queryRunner.query(
      `ALTER TABLE data_hub_consumer_so_apps
         RENAME CONSTRAINT uq_data_hub_consumer_so_apps_pair TO uq_data_hub_consumer_business_contacts_pair`,
    );
    await queryRunner.query(
      `ALTER TABLE data_hub_consumer_so_apps
         RENAME CONSTRAINT data_hub_consumer_so_apps_pkey TO data_hub_consumer_business_contacts_pkey`,
    );
    await queryRunner.query(
      `ALTER SEQUENCE IF EXISTS data_hub_consumer_so_apps_id_seq RENAME TO data_hub_consumer_business_contacts_id_seq`,
    );
    await queryRunner.query(`ALTER TABLE data_hub_consumer_so_apps RENAME TO data_hub_consumer_business_contacts`);
  }
}
