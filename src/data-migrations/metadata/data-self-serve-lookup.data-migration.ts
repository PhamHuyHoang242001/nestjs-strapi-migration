import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '@configuration/env.config';
import { DataSource } from 'typeorm';
import { getOrmConfig } from '../datasource';

export class DataSelfServeLookupDataMigration {
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
    await this.copyTable('data_self_serve_segments', 'id, seg_code, business_date, created_at, updated_at');
    await this.copyTable('data_self_serve_industries', 'id, industry_code, business_date, created_at, updated_at');
    await this.dataDestination.destroy();
    await this.dataSource.destroy();
    console.log('[DataSelfServeLookup] Migration completed.');
  }

  private async copyTable(table: string, columns: string) {
    const rows = await this.dataSource.query(`SELECT ${columns} FROM ${table} ORDER BY id ASC`);
    if (!rows.length) return;
    const definitions = table.endsWith('segments')
      ? 'id INT, seg_code TEXT, business_date DATE, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ'
      : 'id INT, industry_code TEXT, business_date DATE, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ';
    await this.dataDestination.query(
      `
      INSERT INTO ${table} (${columns})
      SELECT * FROM json_to_recordset($1::json) AS x(${definitions})
      ON CONFLICT (id) DO NOTHING
      `,
      [JSON.stringify(rows)],
    );
  }
}
