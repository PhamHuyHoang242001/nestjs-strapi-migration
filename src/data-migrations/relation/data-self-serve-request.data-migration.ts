import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '@configuration/env.config';
import { DataSource } from 'typeorm';
import { getOrmConfig } from '../datasource';

export class DataSelfServeRequestRelationDataMigration {
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
    await this.migrateUserLinks('created_by_user', 'created_by_user_id');
    await this.migrateUserLinks('updated_by_user', 'updated_by_user_id');
    await this.migrateValidationLogRequestLinks();
    await this.dataDestination.destroy();
    await this.dataSource.destroy();
    console.log('[DataSelfServeRequestRelation] Migration completed.');
  }

  private async migrateUserLinks(relation: string, targetColumn: string) {
    const tableName = `data_self_serve_requests_${relation}_lnk`;
    if (!(await this.hasTable(tableName))) return;
    const rows = await this.dataSource.query(`
      SELECT l.data_self_serve_request_id AS request_id, u.email
      FROM ${tableName} l
      INNER JOIN up_users u ON u.id = l.user_id
      WHERE u.email IS NOT NULL
    `);
    if (!rows.length) return;
    const users = await this.dataDestination.query(`SELECT id, email FROM users WHERE email = ANY($1)`, [
      rows.map((row) => row.email),
    ]);
    const emailToId = new Map(users.map((user) => [user.email, user.id]));
    const updates = rows
      .map((row) => ({ request_id: row.request_id, user_id: emailToId.get(row.email) }))
      .filter((row) => row.user_id);
    if (!updates.length) return;
    await this.dataDestination.query(
      `
      UPDATE data_self_serve_requests r
      SET ${targetColumn} = x.user_id
      FROM json_to_recordset($1::json) AS x(request_id INT, user_id INT)
      WHERE r.id = x.request_id
      `,
      [JSON.stringify(updates)],
    );
  }

  private async migrateValidationLogRequestLinks() {
    const tableName = 'data_self_serve_validation_logs_request_lnk';
    if (!(await this.hasTable(tableName))) return;
    const rows = await this.dataSource.query(`
      SELECT data_self_serve_validation_log_id AS log_id, data_self_serve_request_id AS request_id
      FROM ${tableName}
    `);
    if (!rows.length) return;
    await this.dataDestination.query(
      `
      UPDATE data_self_serve_validation_logs l
      SET request_id = x.request_id
      FROM json_to_recordset($1::json) AS x(log_id INT, request_id INT)
      WHERE l.id = x.log_id
      `,
      [JSON.stringify(rows)],
    );
  }

  private async hasTable(tableName: string) {
    const rows = await this.dataSource.query(`SELECT to_regclass($1) AS table_name`, [tableName]);
    return Boolean(rows[0]?.table_name);
  }
}
