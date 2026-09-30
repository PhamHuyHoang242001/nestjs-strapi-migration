import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTokenIdToken2609281000 implements MigrationInterface {
  name = 'AddTokenIdToken2609281000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE token ADD COLUMN IF NOT EXISTS id_token text NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE token DROP COLUMN IF EXISTS id_token`);
  }
}
