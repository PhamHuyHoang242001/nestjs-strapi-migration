import { MigrationInterface, QueryRunner } from 'typeorm';

// A coworker version's channel link is optional: a version may list channels without a link for
// each. Environments that already ran CoworkerPerChannelLink2610141500 got the column as NOT NULL;
// this relaxes it. No-op where the column is already nullable.
export class CoworkerChannelLinkOptional2610141700 implements MigrationInterface {
  name = 'CoworkerChannelLinkOptional2610141700';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE coworker_version_channels ALTER COLUMN link DROP NOT NULL`);
  }

  // Only re-tightens when no row relies on the column being nullable.
  public async down(queryRunner: QueryRunner): Promise<void> {
    const nulls = (await queryRunner.query(
      `SELECT 1 FROM coworker_version_channels WHERE link IS NULL LIMIT 1`,
    )) as unknown[];
    if (!nulls.length) {
      await queryRunner.query(`ALTER TABLE coworker_version_channels ALTER COLUMN link SET NOT NULL`);
    }
  }
}
