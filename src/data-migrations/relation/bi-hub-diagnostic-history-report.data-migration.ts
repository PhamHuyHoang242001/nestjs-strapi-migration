import { DataSource } from 'typeorm';
import { getOrmConfig } from '../datasource';
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '@configuration/env.config';

interface ExtractedAdminAuthor {
  history_id: number;
  creator_email: string | null;
  updater_email: string | null;
}

interface UserRelation {
  id: number;
  created_by_admin_id: number | null;
  updated_by_admin_id: number | null;
}

export class BiHubDiagnosticHistoryReportRelationDataMigration {
  private dataDestination: DataSource;
  private dataSource: DataSource;

  constructor(data: { db_host: string; db_port: string; db_username: string; db_name: string; db_password: string }) {
    this.dataDestination = new DataSource(
      getOrmConfig({
        host: DB_HOST,
        port: DB_PORT,
        username: DB_USERNAME,
        password: DB_PASSWORD,
        db_name: DB_NAME,
      }),
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
    let offset = 1;
    let isFetch = true;
    let count = 0;

    while (isFetch) {
      const raws = await this.extract(offset, limit);
      if (raws.length === 0) break;

      const userRelations = await this.transform(raws);
      await this.load(userRelations);

      if (raws.length < limit) {
        isFetch = false;
      }
      count += raws.length;
      offset += 1;
    }

    console.log(`[DiagnosticHistoryReportRelation] Updated ${count} records.`);
  }

  async extract(offset: number, limit: number): Promise<ExtractedAdminAuthor[]> {
    const query = `
      SELECT
        h.id as history_id,
        creator.email as creator_email,
        updater.email as updater_email
      FROM bi_diagnostic_history_reports h
      LEFT JOIN admin_users creator ON h.created_by_id = creator.id
      LEFT JOIN admin_users updater ON h.updated_by_id = updater.id
      WHERE h.created_by_id IS NOT NULL OR h.updated_by_id IS NOT NULL
      ORDER BY h.id ASC
      LIMIT $1 OFFSET $2
    `;
    return this.dataSource.query(query, [limit, (offset - 1) * limit]);
  }

  async transform(data: ExtractedAdminAuthor[]): Promise<UserRelation[]> {
    // Collect unique emails from batch
    const emails = new Set<string>();
    data.forEach((item) => {
      if (item.creator_email) emails.add(item.creator_email);
      if (item.updater_email) emails.add(item.updater_email);
    });

    if (emails.size === 0) return [];

    // Bulk resolve emails against NestJS users table
    const users: { id: number; email: string }[] = await this.dataDestination.query(
      `SELECT id, email FROM users WHERE email = ANY($1)`,
      [Array.from(emails)],
    );
    const emailToUserId = new Map(users.map((u) => [u.email, u.id]));

    // Map to user relations, dedup by history_id
    const relationsMap = new Map<number, UserRelation>();
    data.forEach((item) => {
      if (!relationsMap.has(item.history_id)) {
        relationsMap.set(item.history_id, {
          id: item.history_id,
          created_by_admin_id: item.creator_email ? (emailToUserId.get(item.creator_email) ?? null) : null,
          updated_by_admin_id: item.updater_email ? (emailToUserId.get(item.updater_email) ?? null) : null,
        });
      }
    });

    return Array.from(relationsMap.values());
  }

  async load(userRelations: UserRelation[]) {
    if (!userRelations.length) return;
    const query = `
      UPDATE bi_hub_diagnostic_history_reports h
      SET
        created_by_admin_id = x.created_by_admin_id,
        updated_by_admin_id = x.updated_by_admin_id
      FROM json_to_recordset($1::json)
      AS x(id INT, created_by_admin_id INT, updated_by_admin_id INT)
      WHERE h.id = x.id
    `;
    await this.dataDestination.query(query, [JSON.stringify(userRelations)]);
  }
}
