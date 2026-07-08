import { MigrationInterface, QueryRunner } from 'typeorm';

// Tách bi_payment_documents + bi_payment_templates khỏi ma_tool_* theo quyết định
// dedicated-tables (user 2026-07-06). Template workstep_type drives file permission.
export class CreateBiPaymentDocumentsTemplatesTables2607061500 implements MigrationInterface {
  name = 'CreateBiPaymentDocumentsTemplatesTables2607061500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // bi_payment_templates
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bi_payment_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR,
        description TEXT,
        image_url VARCHAR,
        upload_method VARCHAR,
        upload_date_frequency VARCHAR,
        exploit_frequency VARCHAR,
        exploit_date DATE,
        template_status VARCHAR,
        workstep_type VARCHAR,
        template_type VARCHAR,
        request_active_at DATE,
        approved_at DATE,
        activated_at DATE,
        inactivated_at DATE,
        rejected_at DATE,
        sending_date DATE,
        ending_date DATE,
        reason TEXT,
        version INT,
        deleted_at_custom DATE,
        bi_payment_program_id INT,
        template_created_by_id INT,
        template_updated_by_id INT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE
      )
    `);

    // bi_payment_documents
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bi_payment_documents (
        id SERIAL PRIMARY KEY,
        document_code VARCHAR,
        document_name VARCHAR,
        document_date DATE,
        document_status VARCHAR,
        notes TEXT,
        file_url VARCHAR,
        file_size VARCHAR,
        validation_status VARCHAR,
        s3_destination_path VARCHAR,
        s3_portal_destination_path VARCHAR,
        s3_upload_status VARCHAR,
        back_date_mode VARCHAR,
        back_date_type VARCHAR,
        back_date_file_id INT,
        back_date_time TIMESTAMPTZ,
        is_reuploaded BOOLEAN DEFAULT FALSE,
        version INT,
        template_id INT,
        program_id INT,
        bi_payment_checklist_id INT,
        uploaded_by_id INT,
        rejected_by_id INT,
        rejected_at TIMESTAMPTZ,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE
      )
    `);

    // Perf: list documents per program + workstep_type (template's).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bi_payment_documents_program_id
      ON bi_payment_documents (program_id)
      WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bi_payment_documents_template_id
      ON bi_payment_documents (template_id)
      WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bi_payment_templates_program_id
      ON bi_payment_templates (bi_payment_program_id)
      WHERE deleted_at IS NULL
    `);
    // workstep_type filter on templates
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bi_payment_templates_workstep_type
      ON bi_payment_templates (workstep_type)
      WHERE deleted_at IS NULL
    `);

    // bicc_department_id FK on bi_payment_projects (owner-scope parent: bicc-dept → project).
    // Column may already exist if prod schema has it; IF NOT EXISTS guards the add.
    await queryRunner.query(`
      ALTER TABLE bi_payment_projects
      ADD COLUMN IF NOT EXISTS bicc_department_id INT
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bi_payment_projects_bicc_department_id
      ON bi_payment_projects (bicc_department_id)
      WHERE deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_bi_payment_projects_bicc_department_id');
    await queryRunner.query('DROP INDEX IF EXISTS idx_bi_payment_templates_workstep_type');
    await queryRunner.query('DROP INDEX IF EXISTS idx_bi_payment_templates_program_id');
    await queryRunner.query('DROP INDEX IF EXISTS idx_bi_payment_documents_template_id');
    await queryRunner.query('DROP INDEX IF EXISTS idx_bi_payment_documents_program_id');
    await queryRunner.query('DROP TABLE IF EXISTS bi_payment_documents CASCADE');
    await queryRunner.query('DROP TABLE IF EXISTS bi_payment_templates CASCADE');
    // NOTE: bicc_department_id column not dropped on down (may pre-exist in prod).
  }
}
