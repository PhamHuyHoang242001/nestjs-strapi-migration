import { MigrationInterface, QueryRunner } from 'typeorm';

// How a coworker channel's link is validated against its `domain` entries:
// 'prefix' = URL whose origin equals an entry (Teams, Zalo; also the behaviour when NULL),
// 'suffix' = value ends with an entry (Outlook address ending in "@vpbank.com.vn").
// Nullable so existing channels keep the URL check without a data change; values set by ops.
export class CoworkerChannelLinkMatchType2610141900 implements MigrationInterface {
  name = 'CoworkerChannelLinkMatchType2610141900';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ai_hub_coworker_channels ADD COLUMN IF NOT EXISTS type VARCHAR(20)`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_hub_coworker_channels_type') THEN
          ALTER TABLE ai_hub_coworker_channels
            ADD CONSTRAINT chk_ai_hub_coworker_channels_type CHECK (type IS NULL OR type IN ('prefix', 'suffix'));
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ai_hub_coworker_channels DROP CONSTRAINT IF EXISTS chk_ai_hub_coworker_channels_type`,
    );
    await queryRunner.query(`ALTER TABLE ai_hub_coworker_channels DROP COLUMN IF EXISTS type`);
  }
}
