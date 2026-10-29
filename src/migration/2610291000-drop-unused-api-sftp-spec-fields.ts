import { MigrationInterface, QueryRunner } from 'typeorm';

const API = 'data_hub_data_service_version_api_specs';
const SFTP = 'data_hub_data_service_version_sftp_specs';

// Fields the data-service form no longer collects:
// - API: token endpoint, token auth method; sync mode keeps only SYNC / ASYNC (a BATCH row becomes ASYNC, the
//   closest remaining mode, which also does not require a timeout).
// - SFTP: host, port, auth type, key vault method, vault account.
// Dropping a column also drops its single-column CHECK; the sync_mode CHECK is rebuilt with the new list.
// `down` brings the columns back empty (port 22, auth type SSH_KEY on existing rows): the dropped values are lost.
export class DropUnusedApiSftpSpecFields2610291000 implements MigrationInterface {
  name = 'DropUnusedApiSftpSpecFields2610291000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ${API} DROP CONSTRAINT IF EXISTS ck_${API}_sync_mode`);
    await queryRunner.query(`UPDATE ${API} SET sync_mode = 'ASYNC' WHERE sync_mode = 'BATCH'`);
    await queryRunner.query(
      `ALTER TABLE ${API} ADD CONSTRAINT ck_${API}_sync_mode CHECK (sync_mode IN ('SYNC', 'ASYNC'))`,
    );
    await queryRunner.query(
      `ALTER TABLE ${API} DROP COLUMN IF EXISTS token_endpoint, DROP COLUMN IF EXISTS token_auth_method`,
    );
    await queryRunner.query(
      `ALTER TABLE ${SFTP} DROP COLUMN IF EXISTS host, DROP COLUMN IF EXISTS port, DROP COLUMN IF EXISTS auth_type,
         DROP COLUMN IF EXISTS key_vault_method, DROP COLUMN IF EXISTS vault_account`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ${SFTP}
         ADD COLUMN IF NOT EXISTS host VARCHAR(255),
         ADD COLUMN IF NOT EXISTS port INT NOT NULL DEFAULT 22,
         ADD COLUMN IF NOT EXISTS auth_type VARCHAR(50) NOT NULL DEFAULT 'SSH_KEY',
         ADD COLUMN IF NOT EXISTS key_vault_method VARCHAR(50),
         ADD COLUMN IF NOT EXISTS vault_account VARCHAR(255)`,
    );
    await queryRunner.query(`ALTER TABLE ${SFTP} ALTER COLUMN auth_type DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE ${SFTP}
         ADD CONSTRAINT ck_${SFTP}_port CHECK (port BETWEEN 1 AND 65535),
         ADD CONSTRAINT ck_${SFTP}_auth_type CHECK (auth_type IN ('SSH_KEY', 'PASSWORD')),
         ADD CONSTRAINT ck_${SFTP}_key_vault_method
           CHECK (key_vault_method IN ('CYBERARK_PAM', 'LOCAL_KEYSTORE', 'HSM_VAULT'))`,
    );
    await queryRunner.query(
      `ALTER TABLE ${API} ADD COLUMN IF NOT EXISTS token_endpoint VARCHAR(1000),
         ADD COLUMN IF NOT EXISTS token_auth_method VARCHAR(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE ${API} ADD CONSTRAINT ck_${API}_token_auth_method
         CHECK (token_auth_method IN ('BASIC', 'X_SECRET_KEY', 'X_IBM_CLIENT_ID'))`,
    );
    await queryRunner.query(`ALTER TABLE ${API} DROP CONSTRAINT IF EXISTS ck_${API}_sync_mode`);
    await queryRunner.query(
      `ALTER TABLE ${API} ADD CONSTRAINT ck_${API}_sync_mode CHECK (sync_mode IN ('SYNC', 'ASYNC', 'BATCH'))`,
    );
  }
}
