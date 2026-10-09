import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiHubSupporters2610091500 implements MigrationInterface {
  name = 'CreateAiHubSupporters2610091500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_hub_supporters (
        id SERIAL PRIMARY KEY,
        data_id INTEGER NOT NULL,
        type VARCHAR(20) NOT NULL,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP WITHOUT TIME ZONE,
        is_deleted BOOLEAN DEFAULT FALSE,
        CONSTRAINT chk_ai_hub_supporters_type CHECK (type IN ('skill', 'prompt', 'api-catalog', 'coworker'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_hub_supporters_live
      ON ai_hub_supporters (type, data_id, user_id)
      WHERE deleted_at IS NULL AND is_deleted IS NOT TRUE
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_hub_supporters_type_data
      ON ai_hub_supporters (type, data_id)
      WHERE deleted_at IS NULL AND is_deleted IS NOT TRUE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ai_hub_supporters_type_data`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_ai_hub_supporters_live`);
    await queryRunner.query(`DROP TABLE IF EXISTS ai_hub_supporters`);
  }
}
