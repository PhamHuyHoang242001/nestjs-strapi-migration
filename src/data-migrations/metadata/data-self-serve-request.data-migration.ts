import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '@configuration/env.config';
import { DataSource } from 'typeorm';
import { getOrmConfig } from '../datasource';

export class DataSelfServeRequestDataMigration {
  private dataDestination: DataSource;
  private dataSource: DataSource;

  constructor(data: { db_host: string; db_port: string; db_username: string; db_name: string; db_password: string }) {
    this.dataDestination = new DataSource(
      getOrmConfig({ host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, db_name: DB_NAME }),
    );
    this.dataSource = new DataSource(
      getOrmConfig({
        host: data.db_host,
        port: +data.db_port,
        username: data.db_username,
        password: data.db_password,
        db_name: data.db_name,
      }),
    );
  }

  async run() {
    await this.dataDestination.initialize();
    await this.dataSource.initialize();
    const limit = 10000;
    let offset = 0;
    let count = 0;
    while (true) {
      const rows = await this.extract(offset, limit);
      if (!rows.length) break;
      await this.load(rows);
      count += rows.length;
      offset += limit;
      if (rows.length < limit) break;
    }
    await this.resetSequence();
    await this.dataDestination.destroy();
    await this.dataSource.destroy();
    console.log(`[DataSelfServeRequest] Migrate ${count} records completed.`);
  }

  private extract(offset: number, limit: number) {
    return this.dataSource.query(
      `
      SELECT id, request_status, request_group, validation_status, destination_path,
        backup_input_file_path, code, portal_file_url, input_method, file_size,
        source, storage_type, estimated_completion_hours, request_params,
        response_body, rows_file_input, request_completed_at, short_description,
        created_at, updated_at
      FROM data_self_serve_requests
      ORDER BY id ASC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset],
    );
  }

  private async load(data: any[]) {
    const query = `
      INSERT INTO data_self_serve_requests (
        id, request_status, request_group, validation_status, destination_path,
        backup_input_file_path, code, portal_file_url, input_method, file_size,
        source, storage_type, estimated_completion_hours, request_params,
        response_body, rows_file_input, request_completed_at, short_description,
        created_at, updated_at
      )
      SELECT
        x.id, x.request_status, x.request_group, x.validation_status, x.destination_path,
        x.backup_input_file_path, x.code, x.portal_file_url, x.input_method, x.file_size,
        x.source, x.storage_type, x.estimated_completion_hours, x.request_params,
        x.response_body, x.rows_file_input, x.request_completed_at, x.short_description,
        -- legacy rows can carry NULL timestamps; column is NOT NULL so fall back to now()
        COALESCE(x.created_at, CURRENT_TIMESTAMP) AS created_at,
        COALESCE(x.updated_at, x.created_at, CURRENT_TIMESTAMP) AS updated_at
      FROM json_to_recordset($1::json) AS x(
        id INT, request_status TEXT, request_group TEXT, validation_status TEXT,
        destination_path TEXT, backup_input_file_path TEXT, code TEXT,
        portal_file_url TEXT, input_method TEXT, file_size TEXT, source TEXT,
        storage_type TEXT, estimated_completion_hours INT, request_params JSONB,
        response_body JSONB, rows_file_input JSONB, request_completed_at TIMESTAMPTZ,
        short_description TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
      )
      ON CONFLICT (id) DO UPDATE SET
        request_status = EXCLUDED.request_status,
        request_group = EXCLUDED.request_group,
        validation_status = EXCLUDED.validation_status,
        destination_path = EXCLUDED.destination_path,
        backup_input_file_path = EXCLUDED.backup_input_file_path,
        code = EXCLUDED.code,
        portal_file_url = EXCLUDED.portal_file_url,
        input_method = EXCLUDED.input_method,
        file_size = EXCLUDED.file_size,
        source = EXCLUDED.source,
        storage_type = EXCLUDED.storage_type,
        estimated_completion_hours = EXCLUDED.estimated_completion_hours,
        request_params = EXCLUDED.request_params,
        response_body = EXCLUDED.response_body,
        rows_file_input = EXCLUDED.rows_file_input,
        request_completed_at = EXCLUDED.request_completed_at,
        short_description = EXCLUDED.short_description,
        updated_at = EXCLUDED.updated_at
    `;
    await this.dataDestination.query(query, [JSON.stringify(data)]);
  }

  private resetSequence() {
    return this.dataDestination.query(`
      SELECT setval('data_self_serve_requests_id_seq', COALESCE((SELECT MAX(id) FROM data_self_serve_requests), 1))
    `);
  }
}
