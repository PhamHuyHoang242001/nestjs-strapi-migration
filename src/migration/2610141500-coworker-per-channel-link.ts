import { MigrationInterface, QueryRunner } from 'typeorm';

// Each coworker version channel carries its own link; the version-level link goes away.
// - ai_hub_coworker_channels.domain: allowed origin(s) for that channel's links, comma-separated
//   when a channel has several hosts. Filled by ops; NULL = channel not usable for writes yet.
// - coworker_version_channels.link: backfilled from coworker_versions.link (every existing channel
//   row of a version gets that version's link). Nullable: a channel's link is optional. One live
//   row per (version, channel).
// - coworker_versions.link: dropped once copied.
// Fails closed instead of silently losing a link or tripping the unique index on existing data.
export class CoworkerPerChannelLink2610141500 implements MigrationInterface {
  name = 'CoworkerPerChannelLink2610141500';

  private async versionLinkColumnExists(queryRunner: QueryRunner): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'coworker_versions' AND column_name = 'link'`,
    )) as unknown[];
    return rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ai_hub_coworker_channels ADD COLUMN IF NOT EXISTS domain VARCHAR`);
    await queryRunner.query(`ALTER TABLE coworker_version_channels ADD COLUMN IF NOT EXISTS link VARCHAR`);

    if (await this.versionLinkColumnExists(queryRunner)) {
      // A version with a link but no channel row has nowhere to put that link.
      const orphans = (await queryRunner.query(`
        SELECT v.id FROM coworker_versions v
        WHERE v.link IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM coworker_version_channels vc WHERE vc.coworker_version_id = v.id)
        LIMIT 20
      `)) as Array<{ id: number }>;
      if (orphans.length) {
        throw new Error(
          `coworker_versions with a link but no channel rows (would lose link): ${orphans.map((r) => r.id).join(', ')}`,
        );
      }

      // All rows, soft-deleted included, so no existing link is lost.
      await queryRunner.query(`
        UPDATE coworker_version_channels vc
        SET link = v.link
        FROM coworker_versions v
        WHERE v.id = vc.coworker_version_id AND vc.link IS NULL
      `);
    }

    const duplicates = (await queryRunner.query(`
      SELECT coworker_version_id, channel_id FROM coworker_version_channels
      WHERE deleted_at IS NULL
      GROUP BY coworker_version_id, channel_id
      HAVING COUNT(*) > 1
      LIMIT 20
    `)) as Array<{ coworker_version_id: number; channel_id: number }>;
    if (duplicates.length) {
      const pairs = duplicates.map((d) => `(${d.coworker_version_id},${d.channel_id})`).join(', ');
      throw new Error(`duplicate live coworker_version_channels (version, channel): ${pairs}`);
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_coworker_version_channels_live
      ON coworker_version_channels (coworker_version_id, channel_id)
      WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`ALTER TABLE coworker_versions DROP COLUMN IF EXISTS link`);
  }

  // Lossy for multi-link data: the restored version link is the one on the lowest-id live channel row
  // (soft-deleted rows only as a fallback).
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE coworker_versions ADD COLUMN IF NOT EXISTS link VARCHAR`);
    await queryRunner.query(`
      UPDATE coworker_versions v
      SET link = first_row.link
      FROM (
        SELECT DISTINCT ON (coworker_version_id) coworker_version_id, link
        FROM coworker_version_channels
        WHERE link IS NOT NULL
        ORDER BY coworker_version_id, (deleted_at IS NOT NULL), id
      ) first_row
      WHERE first_row.coworker_version_id = v.id AND v.link IS NULL
    `);
    const unfilled = (await queryRunner.query(
      `SELECT 1 FROM coworker_versions WHERE link IS NULL LIMIT 1`,
    )) as unknown[];
    if (!unfilled.length) {
      await queryRunner.query(`ALTER TABLE coworker_versions ALTER COLUMN link SET NOT NULL`);
    }
    await queryRunner.query(`DROP INDEX IF EXISTS uq_coworker_version_channels_live`);
    await queryRunner.query(`ALTER TABLE coworker_version_channels DROP COLUMN IF EXISTS link`);
    await queryRunner.query(`ALTER TABLE ai_hub_coworker_channels DROP COLUMN IF EXISTS domain`);
  }
}
