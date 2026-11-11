import { MigrationInterface, QueryRunner } from 'typeorm';

const SFTP = 'data_hub_data_service_version_sftp_specs';
const CHECK = `ck_${SFTP}_file_format`;
const BEFORE = `'CSV', 'CSV_PIPE', 'PARQUET', 'XLSX', 'JSON'`;

// SFTP file format accepts GZIP as well.
export class AddGzipToDataHubSftpFileFormat2611111500 implements MigrationInterface {
  name = 'AddGzipToDataHubSftpFileFormat2611111500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ${SFTP} DROP CONSTRAINT IF EXISTS ${CHECK}`);
    await queryRunner.query(`ALTER TABLE ${SFTP} ADD CONSTRAINT ${CHECK} CHECK (file_format IN (${BEFORE}, 'GZIP'))`);
  }

  // Rows already saved as GZIP must be changed before rolling back, or the old constraint is rejected.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ${SFTP} DROP CONSTRAINT IF EXISTS ${CHECK}`);
    await queryRunner.query(`ALTER TABLE ${SFTP} ADD CONSTRAINT ${CHECK} CHECK (file_format IN (${BEFORE}))`);
  }
}
