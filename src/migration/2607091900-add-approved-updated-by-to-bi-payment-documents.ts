import { MigrationInterface, QueryRunner } from 'typeorm';

// Approver + last-editor tracking on bi_payment_documents. Unblocks the
// approvedByIds / updatedByIds list-doc filters (Strapi IFindDocument parity)
// and the user-approved / user-updated distinct-user endpoints, which
// previously returned [] / proxied to uploaded_by because the columns did
// not exist. Self-adjusting: IF NOT EXISTS guards re-runs on already-patched
// prod schemas (the create-table migration predates these columns).
export class AddApprovedUpdatedByToBiPaymentDocuments2607091900 implements MigrationInterface {
  name = 'AddApprovedUpdatedByToBiPaymentDocuments2607091900';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE bi_payment_documents
      ADD COLUMN IF NOT EXISTS approved_by_id INT
    `);
    await queryRunner.query(`
      ALTER TABLE bi_payment_documents
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE bi_payment_documents
      ADD COLUMN IF NOT EXISTS updated_by_id INT
    `);
    // Filter support for the new user-id list-doc filters.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bi_payment_documents_approved_by_id
      ON bi_payment_documents (approved_by_id)
      WHERE deleted_at IS NULL AND approved_by_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bi_payment_documents_updated_by_id
      ON bi_payment_documents (updated_by_id)
      WHERE deleted_at IS NULL AND updated_by_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_bi_payment_documents_updated_by_id');
    await queryRunner.query('DROP INDEX IF EXISTS idx_bi_payment_documents_approved_by_id');
    await queryRunner.query('ALTER TABLE bi_payment_documents DROP COLUMN IF EXISTS updated_by_id');
    await queryRunner.query('ALTER TABLE bi_payment_documents DROP COLUMN IF EXISTS approved_at');
    await queryRunner.query('ALTER TABLE bi_payment_documents DROP COLUMN IF EXISTS approved_by_id');
  }
}
