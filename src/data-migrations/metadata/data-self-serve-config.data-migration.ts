import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '@configuration/env.config';
import { DataSource } from 'typeorm';
import { getOrmConfig } from '../datasource';

export class DataSelfServeConfigDataMigration {
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
    const rows = await this.dataSource.query(`SELECT id, key, value FROM config_data_self_serve ORDER BY id ASC`);
    if (rows.length) {
      await this.dataDestination.query(
        `
        INSERT INTO config_data_self_serve (id, key, value)
        SELECT * FROM json_to_recordset($1::json) AS x(id INT, key TEXT, value JSONB)
        ON CONFLICT (id) DO UPDATE SET key = EXCLUDED.key, value = EXCLUDED.value
        `,
        [JSON.stringify(rows)],
      );
    }
    await this.dataDestination.destroy();
    await this.dataSource.destroy();
    console.log(`[DataSelfServeConfig] Migrate ${rows.length} records completed.`);
  }
}
