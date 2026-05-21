import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '@configuration/env.config';
import { DataSource } from 'typeorm';
import { getOrmConfig } from '../datasource';

export class DataSelfServeValidationLogDataMigration {
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
    const hasRequestId = await this.hasColumn('data_self_serve_validation_logs', 'request_id');
    const rows = await this.dataSource.query(`
      SELECT id, total_column, total_row, logs, ${hasRequestId ? 'request_id' : 'NULL::int AS request_id'}, created_at, updated_at
      FROM data_self_serve_validation_logs
      ORDER BY id ASC
    `);
    if (rows.length) await this.load(rows);
    await this.resetSequence();
    await this.dataDestination.destroy();
    await this.dataSource.destroy();
    console.log(`[DataSelfServeValidationLog] Migrate ${rows.length} records completed.`);
  }

  private async hasColumn(table: string, column: string) {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
      [table, column],
    );
    return rows.length > 0;
  }

  private load(data: any[]) {
    return this.dataDestination.query(
      `
      INSERT INTO data_self_serve_validation_logs (id, total_column, total_row, logs, request_id, created_at, updated_at)
      SELECT * FROM json_to_recordset($1::json)
      AS x(id INT, total_column INT, total_row INT, logs JSONB, request_id INT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
      ON CONFLICT (id) DO UPDATE SET
        total_column = EXCLUDED.total_column,
        total_row = EXCLUDED.total_row,
        logs = EXCLUDED.logs,
        request_id = EXCLUDED.request_id,
        updated_at = EXCLUDED.updated_at
      `,
      [JSON.stringify(data)],
    );
  }

  private resetSequence() {
    return this.dataDestination.query(`
      SELECT setval('data_self_serve_validation_logs_id_seq', COALESCE((SELECT MAX(id) FROM data_self_serve_validation_logs), 1))
    `);
  }
}
