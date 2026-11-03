import { MigrationInterface, QueryRunner } from 'typeorm';

const DOMAINS = 'integration_domain_configs';
const SPECS = 'data_hub_data_service_version_api_specs';
const BASE_URL_CHECK = 'ck_data_hub_data_service_version_api_specs_base_url';

// Old gateway code of a spec (base_url) -> seeded domain. Values are frozen here on purpose.
const SEED: Array<{ code: string; url: string; type: 'internal' | 'partner' }> = [
  { code: 'API_INT', url: 'https://api-int.vpbank.com.vn', type: 'internal' },
  { code: 'API_EXT', url: 'https://api-ext.vpbank.com.vn', type: 'partner' },
  { code: 'API_OPEN', url: 'https://api-open.vpbank.com.vn', type: 'partner' },
  { code: 'API_UAT', url: 'https://api-uat.vpbank.com.vn', type: 'internal' },
  { code: 'API', url: 'https://api.vpbank.com.vn', type: 'internal' },
];

const inList = (values: string[]) => values.map((v) => `'${v}'`).join(', ');
// base_url may hold the code (API_INT) or already the origin; both resolve to the seeded url.
const urlOfBaseUrl = (expr: string) =>
  `CASE ${expr} ${SEED.map((d) => `WHEN '${d.code}' THEN '${d.url}'`).join(' ')} ELSE ${expr} END`;
const codeOfUrl = (expr: string) =>
  `CASE ${expr} ${SEED.map((d) => `WHEN '${d.url}' THEN '${d.code}'`).join(' ')} ELSE ${expr} END`;

// Rewrites every change-log entry of one field of the data service history.
const rewriteHistoryField = (from: string, to: string, value: (expr: string) => string) => `
  UPDATE data_hub_data_service_histories h
  SET changes = (
    SELECT jsonb_agg(
             CASE WHEN c->>'field' = '${from}'
               THEN c || jsonb_build_object(
                      'field', '${to}',
                      'label_vi', '${to === 'api_domain' ? 'Domain' : 'Base URL'}',
                      'label_en', '${to === 'api_domain' ? 'Domain' : 'Base URL'}',
                      'old', to_jsonb(${value("c->>'old'")}),
                      'new', to_jsonb(${value("c->>'new'")}))
               ELSE c END
             ORDER BY ord)
    FROM jsonb_array_elements(h.changes) WITH ORDINALITY AS e(c, ord)
  )
  WHERE jsonb_typeof(h.changes) = 'array' AND h.changes @> '[{"field": "${from}"}]'`;

// Shared `integration_domain_configs` table (integration domain config: gateway origins, internal or partner).
// A Data Hub API spec now points to one of them (domain_id, many specs -> one config) instead of carrying a
// base_url code. The five gateways are seeded and the
// existing specs are linked by their old code. The change log keeps the url as the shown value (field api_domain).
// User references (created_by, updated_by, deleted_by) are plain INT without FK, like other tables.
export class CreateIntegrationDomainConfigsAndLinkApiSpecs2611031000 implements MigrationInterface {
  name = 'CreateIntegrationDomainConfigsAndLinkApiSpecs2611031000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${DOMAINS} (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP WITHOUT TIME ZONE,
        is_deleted BOOLEAN DEFAULT FALSE,
        url VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        type VARCHAR(50) NOT NULL,
        created_by INT,
        updated_by INT,
        deleted_by INT,
        CONSTRAINT uq_${DOMAINS}_url UNIQUE (url),
        CONSTRAINT ck_${DOMAINS}_status CHECK (status IN (${inList(['active', 'inactive'])})),
        CONSTRAINT ck_${DOMAINS}_type CHECK (type IN (${inList(['internal', 'partner'])}))
      )
    `);
    await queryRunner.query(
      `INSERT INTO ${DOMAINS} (url, type) VALUES ${SEED.map((d) => `('${d.url}', '${d.type}')`).join(', ')}
       ON CONFLICT (url) DO NOTHING`,
    );

    await queryRunner.query(`ALTER TABLE ${SPECS} ADD COLUMN IF NOT EXISTS domain_id INT REFERENCES ${DOMAINS}(id)`);
    await queryRunner.query(
      `UPDATE ${SPECS} s SET domain_id = d.id FROM ${DOMAINS} d WHERE d.url = ${urlOfBaseUrl('s.base_url')}`,
    );
    // Fails here (NOT NULL) if a spec carried a base_url outside the five gateways, instead of losing it.
    await queryRunner.query(`ALTER TABLE ${SPECS} ALTER COLUMN domain_id SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE ${SPECS} DROP CONSTRAINT IF EXISTS ${BASE_URL_CHECK}`);
    await queryRunner.query(`ALTER TABLE ${SPECS} DROP COLUMN base_url`);

    await queryRunner.query(rewriteHistoryField('api_base_url', 'api_domain', urlOfBaseUrl));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // base_url only knows the five seeded gateways; a spec on any other domain has no code to go back to.
    const others = (await queryRunner.query(
      `SELECT DISTINCT d.url FROM ${SPECS} s JOIN ${DOMAINS} d ON d.id = s.domain_id
       WHERE d.url NOT IN (${inList(SEED.map((d) => d.url))})`,
    )) as Array<{ url: string }>;
    if (others.length > 0) {
      throw new Error(`Cannot revert: API specs use non-seeded domains ${others.map((r) => r.url).join(', ')}`);
    }
    await queryRunner.query(`ALTER TABLE ${SPECS} ADD COLUMN base_url VARCHAR(50)`);
    await queryRunner.query(
      `UPDATE ${SPECS} s SET base_url = ${codeOfUrl('d.url')} FROM ${DOMAINS} d WHERE d.id = s.domain_id`,
    );
    await queryRunner.query(`ALTER TABLE ${SPECS} ALTER COLUMN base_url SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE ${SPECS} ADD CONSTRAINT ${BASE_URL_CHECK} CHECK (base_url IN (${inList(SEED.map((d) => d.code))}))`,
    );
    await queryRunner.query(`ALTER TABLE ${SPECS} DROP COLUMN domain_id`);
    await queryRunner.query(rewriteHistoryField('api_domain', 'api_base_url', codeOfUrl));
    await queryRunner.query(`DROP TABLE IF EXISTS ${DOMAINS}`);
  }
}
