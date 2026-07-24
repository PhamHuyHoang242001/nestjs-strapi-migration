import { MigrationInterface, QueryRunner } from 'typeorm';

// PIC (person-in-charge) link table between users and diagnostic reports.
// Relation-free join table: queried via explicit id joins. IF NOT EXISTS guards
// keep re-runs safe on schemas already synchronized in dev/test.
export class CreateBiHubDiagnosticReportPics2607241200 implements MigrationInterface {
  name = 'CreateBiHubDiagnosticReportPics2607241200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bi_hub_diagnostic_report_pics (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        bi_hub_diagnostic_report_id INT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,
        is_deleted BOOLEAN DEFAULT false
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bi_hub_diagnostic_report_pics_report_id
      ON bi_hub_diagnostic_report_pics (bi_hub_diagnostic_report_id)
      WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bi_hub_diagnostic_report_pics_user_id
      ON bi_hub_diagnostic_report_pics (user_id)
      WHERE deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_bi_hub_diagnostic_report_pics_user_id');
    await queryRunner.query('DROP INDEX IF EXISTS idx_bi_hub_diagnostic_report_pics_report_id');
    await queryRunner.query('DROP TABLE IF EXISTS bi_hub_diagnostic_report_pics');
  }
}
