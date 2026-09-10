import { MigrationInterface, QueryRunner } from 'typeorm';

const RENAMES: Array<[string, string]> = [
  ['api_catalog_package_responsibles', 'ai_api_catalog_package_responsibles'],
  ['api_catalog_version_tags', 'ai_api_catalog_version_tags'],
  ['api_catalog_versions', 'ai_api_catalog_versions'],
  ['api_catalog_packages', 'ai_api_catalog_packages'],
];

export class RenameApiCatalogTablesAiPrefix2609101200 implements MigrationInterface {
  name = 'RenameApiCatalogTablesAiPrefix2609101200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [from, to] of RENAMES) {
      await queryRunner.query(`
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = '${from}'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = '${to}'
          ) THEN
            ALTER TABLE ${from} RENAME TO ${to};
          END IF;
        END $$;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [from, to] of [...RENAMES].reverse()) {
      await queryRunner.query(`
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = '${to}'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = '${from}'
          ) THEN
            ALTER TABLE ${to} RENAME TO ${from};
          END IF;
        END $$;
      `);
    }
  }
}
