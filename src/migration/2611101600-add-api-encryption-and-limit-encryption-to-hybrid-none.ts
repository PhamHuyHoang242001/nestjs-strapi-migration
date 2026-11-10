import { MigrationInterface, QueryRunner } from 'typeorm';

const API = 'data_hub_data_service_version_api_specs';
const SFTP = 'data_hub_data_service_version_sftp_specs';
const VALUES = `'HYBRID', 'NONE'`;

// Encryption is declared on both API and SFTP specs with the same two values: HYBRID or NONE. SFTP rows that said
// PGP_KEY become HYBRID; API specs get the column, NONE for rows written before it existed.
export class AddApiEncryptionAndLimitEncryptionToHybridNone2611101600 implements MigrationInterface {
  name = 'AddApiEncryptionAndLimitEncryptionToHybridNone2611101600';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ${SFTP} DROP CONSTRAINT IF EXISTS ck_${SFTP}_encryption`);
    await queryRunner.query(`UPDATE ${SFTP} SET encryption = 'HYBRID' WHERE encryption = 'PGP_KEY'`);
    await queryRunner.query(
      `ALTER TABLE ${SFTP} ADD CONSTRAINT ck_${SFTP}_encryption CHECK (encryption IN (${VALUES}))`,
    );

    await queryRunner.query(
      `ALTER TABLE ${API} ADD COLUMN IF NOT EXISTS encryption VARCHAR(50) NOT NULL DEFAULT 'NONE'`,
    );
    await queryRunner.query(`ALTER TABLE ${API} DROP CONSTRAINT IF EXISTS ck_${API}_encryption`);
    await queryRunner.query(`ALTER TABLE ${API} ADD CONSTRAINT ck_${API}_encryption CHECK (encryption IN (${VALUES}))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ${API} DROP CONSTRAINT IF EXISTS ck_${API}_encryption`);
    await queryRunner.query(`ALTER TABLE ${API} DROP COLUMN IF EXISTS encryption`);

    await queryRunner.query(`ALTER TABLE ${SFTP} DROP CONSTRAINT IF EXISTS ck_${SFTP}_encryption`);
    await queryRunner.query(`UPDATE ${SFTP} SET encryption = 'PGP_KEY' WHERE encryption = 'HYBRID'`);
    await queryRunner.query(
      `ALTER TABLE ${SFTP} ADD CONSTRAINT ck_${SFTP}_encryption CHECK (encryption IN ('PGP_KEY', 'NONE'))`,
    );
  }
}
