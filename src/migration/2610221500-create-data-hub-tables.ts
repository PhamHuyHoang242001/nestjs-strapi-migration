import { MigrationInterface, QueryRunner } from 'typeorm';

// Base columns of every Data Hub entity table (matches BaseSoftDeleteEntity).
const BASE_SOFT_DELETE = `
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP WITHOUT TIME ZONE,
        is_deleted BOOLEAN DEFAULT FALSE`;

// Link tables are hard-deleted on unlink, so no soft-delete columns.
const BASE_LINK = `
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()`;

const LIVE = `deleted_at IS NULL AND is_deleted IS NOT TRUE`;

// Enum values are frozen here on purpose: a migration must not change when the TS enums evolve.
const inList = (values: string[]) => values.map((v) => `'${v}'`).join(', ');
const STATUS = inList(['active', 'inactive']);

// User references (created_by, updated_by, submitted_by, reviewed_by, changed_by, *user_id) are plain INT
// without FK, like other modules.
//
// Data services follow the package + version model (like api-catalog): the package keeps identity and the
// active pointer, every edit is a new immutable version (content, specs and links), and a version can later
// go through review (pending → approved/rejected) without schema changes. Consumers and terms are plain
// tables with snapshot history.
export class CreateDataHubTables2610221500 implements MigrationInterface {
  name = 'CreateDataHubTables2610221500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Org lists: divisions and departments are independent of each other.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_divisions (${BASE_SOFT_DELETE},
        code VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_departments (${BASE_SOFT_DELETE},
        code VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_request_units (${BASE_SOFT_DELETE},
        code VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100)
      )
    `);

    // version_no counts snapshot rows in data_hub_consumer_histories.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_consumers (${BASE_SOFT_DELETE},
        code VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(50) NOT NULL,
        division_id INT NOT NULL REFERENCES data_hub_divisions(id) ON DELETE RESTRICT,
        department_id INT REFERENCES data_hub_departments(id) ON DELETE RESTRICT,
        short_description VARCHAR(1000) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        version_no INT NOT NULL DEFAULT 1,
        created_by INT NOT NULL,
        updated_by INT,
        CONSTRAINT ck_data_hub_consumers_category
          CHECK (category IN (${inList(['INTERNAL_APP', 'PARTNER_ECOSYSTEM'])})),
        CONSTRAINT ck_data_hub_consumers_status CHECK (status IN (${STATUS}))
      )
    `);

    // Đầu mối liên hệ nghiệp vụ (business contacts): many users per consumer, so a link table instead of a column.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_consumer_business_contacts (${BASE_LINK},
        consumer_id INT NOT NULL REFERENCES data_hub_consumers(id) ON DELETE CASCADE,
        user_id INT NOT NULL,
        CONSTRAINT uq_data_hub_consumer_business_contacts_pair UNIQUE (consumer_id, user_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_logical_terms (${BASE_SOFT_DELETE},
        code VARCHAR(255) NOT NULL,
        short_description VARCHAR(1000) NOT NULL,
        example_value VARCHAR(1000),
        version_no INT NOT NULL DEFAULT 1,
        created_by INT NOT NULL,
        updated_by INT
      )
    `);
    // One logical term is the shared definition of many physical columns; a physical may be unmapped.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_physical_terms (${BASE_SOFT_DELETE},
        physical_column VARCHAR(255) NOT NULL,
        technical_description TEXT NOT NULL,
        example_value VARCHAR(1000) NOT NULL,
        logical_term_id INT REFERENCES data_hub_logical_terms(id) ON DELETE RESTRICT,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        created_by INT NOT NULL,
        updated_by INT,
        CONSTRAINT ck_data_hub_physical_terms_status CHECK (status IN (${STATUS}))
      )
    `);

    // Package: identity that never changes across versions, plus the pointer to the live version.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_data_services (${BASE_SOFT_DELETE},
        service_code VARCHAR(100) NOT NULL,
        service_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        active_version_id INT,
        created_by INT NOT NULL,
        updated_by INT,
        CONSTRAINT ck_data_hub_data_services_service_type CHECK (service_type IN (${inList(['API', 'SFTP'])})),
        CONSTRAINT ck_data_hub_data_services_status CHECK (status IN (${STATUS}))
      )
    `);
    // Version: full content snapshot. version_no is final once approved; a pending version carries a
    // placeholder and old_version (the approved version it was based on).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_data_service_versions (${BASE_SOFT_DELETE},
        data_service_id INT NOT NULL REFERENCES data_hub_data_services(id) ON DELETE RESTRICT,
        version_no INT NOT NULL,
        old_version INT,
        state VARCHAR(50) NOT NULL DEFAULT 'pending',
        name VARCHAR(255) NOT NULL,
        short_description VARCHAR(1000) NOT NULL,
        purpose VARCHAR(2000),
        request_unit_id INT NOT NULL REFERENCES data_hub_request_units(id) ON DELETE RESTRICT,
        division_id INT NOT NULL REFERENCES data_hub_divisions(id) ON DELETE RESTRICT,
        department_id INT NOT NULL REFERENCES data_hub_departments(id) ON DELETE RESTRICT,
        source_table VARCHAR(1000) NOT NULL,
        usage_guide_html TEXT NOT NULL DEFAULT '',
        changelog_note TEXT,
        submitted_by INT NOT NULL,
        reviewed_by INT,
        reviewed_at TIMESTAMP WITHOUT TIME ZONE,
        reject_reason TEXT,
        CONSTRAINT ck_data_hub_data_service_versions_state
          CHECK (state IN (${inList(['pending', 'approved', 'rejected'])}))
      )
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_data_hub_data_services_active_version') THEN
          ALTER TABLE data_hub_data_services
            ADD CONSTRAINT fk_data_hub_data_services_active_version
            FOREIGN KEY (active_version_id) REFERENCES data_hub_data_service_versions (id) ON DELETE SET NULL;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_data_service_version_api_specs (${BASE_SOFT_DELETE},
        data_service_version_id INT NOT NULL REFERENCES data_hub_data_service_versions(id) ON DELETE CASCADE,
        method VARCHAR(50) NOT NULL,
        base_url VARCHAR(50) NOT NULL,
        endpoint_path VARCHAR(1000) NOT NULL,
        auth_type VARCHAR(50) NOT NULL,
        token_endpoint VARCHAR(1000),
        token_auth_method VARCHAR(50),
        peak_tps VARCHAR(255),
        update_frequency VARCHAR(50) NOT NULL,
        sync_mode VARCHAR(50) NOT NULL,
        timeout VARCHAR(100),
        sample_request JSONB,
        sample_response JSONB,
        CONSTRAINT ck_data_hub_data_service_version_api_specs_method
          CHECK (method IN (${inList(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])})),
        CONSTRAINT ck_data_hub_data_service_version_api_specs_base_url
          CHECK (base_url IN (${inList(['API_INT', 'API_EXT', 'API_OPEN', 'API_UAT', 'API'])})),
        CONSTRAINT ck_data_hub_data_service_version_api_specs_auth_type
          CHECK (auth_type IN (${inList([
            'X_SECRET_KEY',
            'X_IBM_CLIENT_ID',
            'X_IBM_CLIENT_SECRET',
            'CLIENT_ID',
            'BEARER_TOKEN',
          ])})),
        CONSTRAINT ck_data_hub_data_service_version_api_specs_token_auth_method
          CHECK (token_auth_method IN (${inList(['BASIC', 'X_SECRET_KEY', 'X_IBM_CLIENT_ID'])})),
        CONSTRAINT ck_data_hub_data_service_version_api_specs_update_frequency
          CHECK (update_frequency IN (${inList(['REALTIME', 'NEAR_REALTIME', 'DAILY_D1', 'ADHOC'])})),
        CONSTRAINT ck_data_hub_data_service_version_api_specs_sync_mode
          CHECK (sync_mode IN (${inList(['SYNC', 'ASYNC', 'BATCH'])}))
      )
    `);
    // host / folder / file pattern / direction are optional until the create form collects them.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_data_service_version_sftp_specs (${BASE_SOFT_DELETE},
        data_service_version_id INT NOT NULL REFERENCES data_hub_data_service_versions(id) ON DELETE CASCADE,
        host VARCHAR(255),
        port INT NOT NULL DEFAULT 22,
        auth_type VARCHAR(50) NOT NULL,
        key_vault_method VARCHAR(50),
        vault_account VARCHAR(255),
        folder_path VARCHAR(1000),
        file_name_pattern VARCHAR(500),
        file_format VARCHAR(50) NOT NULL,
        export_frequency VARCHAR(50) NOT NULL,
        max_file_size VARCHAR(255),
        encryption VARCHAR(50) NOT NULL,
        flow_direction VARCHAR(50),
        CONSTRAINT ck_data_hub_data_service_version_sftp_specs_port CHECK (port BETWEEN 1 AND 65535),
        CONSTRAINT ck_data_hub_data_service_version_sftp_specs_auth_type
          CHECK (auth_type IN (${inList(['SSH_KEY', 'PASSWORD'])})),
        CONSTRAINT ck_data_hub_data_service_version_sftp_specs_key_vault_method
          CHECK (key_vault_method IN (${inList(['CYBERARK_PAM', 'LOCAL_KEYSTORE', 'HSM_VAULT'])})),
        CONSTRAINT ck_data_hub_data_service_version_sftp_specs_file_format
          CHECK (file_format IN (${inList(['CSV', 'CSV_PIPE', 'PARQUET', 'XLSX', 'JSON'])})),
        CONSTRAINT ck_data_hub_data_service_version_sftp_specs_export_frequency
          CHECK (export_frequency IN (${inList(['DAILY_0200', 'HOURLY', 'W_1', 'M_1', 'ADHOC'])})),
        CONSTRAINT ck_data_hub_data_service_version_sftp_specs_encryption
          CHECK (encryption IN (${inList(['PGP_KEY', 'NONE'])})),
        CONSTRAINT ck_data_hub_data_service_version_sftp_specs_flow_direction
          CHECK (flow_direction IN (${inList(['PUSH', 'PULL'])}))
      )
    `);

    // Change log shown in "Lịch sử phiên bản": one row per applied change; `changes` holds only the changed
    // fields (old/new). STATUS rows record the package active/inactive toggle (no new version).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_data_service_histories (${BASE_SOFT_DELETE},
        data_service_id INT NOT NULL REFERENCES data_hub_data_services(id) ON DELETE RESTRICT,
        data_service_version_id INT REFERENCES data_hub_data_service_versions(id) ON DELETE RESTRICT,
        version_no INT,
        action VARCHAR(50) NOT NULL,
        change_note TEXT,
        changes JSONB,
        changed_by INT NOT NULL,
        CONSTRAINT ck_data_hub_data_service_histories_action
          CHECK (action IN (${inList(['CREATE', 'UPDATE', 'STATUS'])}))
      )
    `);
    // Snapshot keeps the attached physical columns as they were at that version.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_logical_term_histories (${BASE_SOFT_DELETE},
        logical_term_id INT NOT NULL REFERENCES data_hub_logical_terms(id) ON DELETE RESTRICT,
        version_no INT NOT NULL,
        action VARCHAR(50) NOT NULL,
        snapshot JSONB NOT NULL,
        changed_by INT NOT NULL,
        CONSTRAINT ck_data_hub_logical_term_histories_action CHECK (action IN (${inList(['CREATE', 'UPDATE'])}))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_consumer_histories (${BASE_SOFT_DELETE},
        consumer_id INT NOT NULL REFERENCES data_hub_consumers(id) ON DELETE RESTRICT,
        version_no INT NOT NULL,
        action VARCHAR(50) NOT NULL,
        snapshot JSONB NOT NULL,
        changed_by INT NOT NULL,
        CONSTRAINT ck_data_hub_consumer_histories_action
          CHECK (action IN (${inList(['CREATE', 'UPDATE', 'STATUS'])}))
      )
    `);

    // Links belong to a version, so a pending version never alters what the live version exposes.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_data_service_version_requesters (${BASE_LINK},
        data_service_version_id INT NOT NULL REFERENCES data_hub_data_service_versions(id) ON DELETE CASCADE,
        user_id INT NOT NULL,
        CONSTRAINT uq_data_hub_data_service_version_requesters_pair UNIQUE (data_service_version_id, user_id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_data_service_version_it_supporters (${BASE_LINK},
        data_service_version_id INT NOT NULL REFERENCES data_hub_data_service_versions(id) ON DELETE CASCADE,
        user_id INT NOT NULL,
        CONSTRAINT uq_data_hub_data_service_version_it_supporters_pair UNIQUE (data_service_version_id, user_id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_data_service_version_consumers (${BASE_LINK},
        data_service_version_id INT NOT NULL REFERENCES data_hub_data_service_versions(id) ON DELETE CASCADE,
        consumer_id INT NOT NULL REFERENCES data_hub_consumers(id) ON DELETE RESTRICT,
        CONSTRAINT uq_data_hub_data_service_version_consumers_pair UNIQUE (data_service_version_id, consumer_id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_hub_data_service_version_physical_terms (${BASE_LINK},
        data_service_version_id INT NOT NULL REFERENCES data_hub_data_service_versions(id) ON DELETE CASCADE,
        physical_term_id INT NOT NULL REFERENCES data_hub_physical_terms(id) ON DELETE RESTRICT,
        CONSTRAINT uq_data_hub_data_service_version_physical_terms_pair
          UNIQUE (data_service_version_id, physical_term_id)
      )
    `);

    // Case-insensitive uniqueness must also fold Vietnamese letters (Ã, Đ, Ị…). With a C/POSIX database
    // locale LOWER() only folds ASCII, so use the ICU collation when the server has it.
    const icu = (await queryRunner.query(
      `SELECT EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'und-x-icu') AS ok`,
    )) as Array<{ ok: boolean }>;
    const ci = (column: string) => (icu[0]?.ok ? `LOWER(${column} COLLATE "und-x-icu")` : `LOWER(${column})`);

    // Unique among live rows only, so a soft-deleted code can be reused.
    const liveUniques: Array<[string, string, string]> = [
      ['uq_data_hub_divisions_code_live', 'data_hub_divisions', 'code'],
      ['uq_data_hub_departments_code_live', 'data_hub_departments', 'code'],
      ['uq_data_hub_request_units_code_live', 'data_hub_request_units', 'code'],
      ['uq_data_hub_consumers_code_live', 'data_hub_consumers', 'code'],
      // Logical code is unique case-insensitively, like physical columns.
      ['uq_data_hub_logical_terms_code_live', 'data_hub_logical_terms', ci('code')],
      ['uq_data_hub_physical_terms_column_live', 'data_hub_physical_terms', ci('physical_column')],
      ['uq_data_hub_data_services_code_live', 'data_hub_data_services', 'service_code'],
      [
        'uq_data_hub_ds_version_api_specs_version_live',
        'data_hub_data_service_version_api_specs',
        'data_service_version_id',
      ],
      [
        'uq_data_hub_ds_version_sftp_specs_version_live',
        'data_hub_data_service_version_sftp_specs',
        'data_service_version_id',
      ],
    ];
    for (const [indexName, table, columns] of liveUniques) {
      await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON ${table} (${columns}) WHERE ${LIVE}`);
    }
    // Review invariants (same as coworker/api-catalog): at most one pending version per service, and
    // approved version numbers never repeat.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_data_hub_ds_versions_one_pending
      ON data_hub_data_service_versions (data_service_id)
      WHERE state = 'pending' AND ${LIVE}
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_data_hub_ds_versions_approved_version_no
      ON data_hub_data_service_versions (data_service_id, version_no)
      WHERE state = 'approved' AND ${LIVE}
    `);

    // Snapshot history is append-only: a version number is never reused, even if a row were soft-deleted.
    const historyUniques: Array<[string, string, string]> = [
      ['uq_data_hub_logical_term_histories_version', 'data_hub_logical_term_histories', 'logical_term_id, version_no'],
      ['uq_data_hub_consumer_histories_version', 'data_hub_consumer_histories', 'consumer_id, version_no'],
    ];
    for (const [indexName, table, columns] of historyUniques) {
      await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON ${table} (${columns})`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE IF EXISTS data_hub_data_services DROP CONSTRAINT IF EXISTS fk_data_hub_data_services_active_version`,
    );
    const tables = [
      'data_hub_consumer_business_contacts',
      'data_hub_data_service_version_physical_terms',
      'data_hub_data_service_version_consumers',
      'data_hub_data_service_version_it_supporters',
      'data_hub_data_service_version_requesters',
      'data_hub_consumer_histories',
      'data_hub_logical_term_histories',
      'data_hub_data_service_histories',
      'data_hub_data_service_version_sftp_specs',
      'data_hub_data_service_version_api_specs',
      'data_hub_data_service_versions',
      'data_hub_data_services',
      'data_hub_physical_terms',
      'data_hub_logical_terms',
      'data_hub_consumers',
      'data_hub_request_units',
      'data_hub_departments',
      'data_hub_divisions',
    ];
    for (const table of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${table}`);
    }
  }
}
