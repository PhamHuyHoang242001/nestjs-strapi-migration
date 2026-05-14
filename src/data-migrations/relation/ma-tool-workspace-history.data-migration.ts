import { DataSource } from 'typeorm';
import { getOrmConfig } from '../datasource';
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '@configuration/env.config';

interface ExtractedWorkspaceHistoryAuthor {
  history_id: number;
  creator_email: string | null;
  updater_email: string | null;
}

interface WorkspaceHistoryAuthorRelation {
  id: number;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
}

export class MaToolWorkspaceHistoryRelationDataMigration {
  private dataDestination: DataSource;
  private dataSource: DataSource;
  private createdByColumn: string | null = null;
  private updatedByColumn: string | null = null;

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
    await this.prepareSourceShape();

    const limit = 10000;
    let offset = 1;
    let isFetch = true;
    let count = 0;

    while (isFetch) {
      const raws = await this.extract(offset, limit);
      const transformed = await this.transform(raws);
      await this.load(transformed);

      if (raws.length < limit) {
        isFetch = false;
      }

      count += raws.length;
      offset += 1;
    }

    console.log(`[MaToolWorkspaceHistoryRelation] Migrate ${count} records completed.`);
  }

  async prepareSourceShape() {
    this.createdByColumn = await this.firstExistingColumn('ma_tool_workspace_histories', [
      'created_by_id',
      'created_by',
    ]);
    this.updatedByColumn = await this.firstExistingColumn('ma_tool_workspace_histories', [
      'updated_by_id',
      'updated_by',
    ]);
  }

  async extract(offset: number, limit: number): Promise<ExtractedWorkspaceHistoryAuthor[]> {
    if (!this.createdByColumn && !this.updatedByColumn) return [];

    const creatorJoin = this.createdByColumn
      ? `LEFT JOIN admin_users creator ON h.${this.createdByColumn} = creator.id`
      : '';
    const updaterJoin = this.updatedByColumn
      ? `LEFT JOIN admin_users updater ON h.${this.updatedByColumn} = updater.id`
      : '';
    const creatorSelect = this.createdByColumn ? 'creator.email' : 'NULL';
    const updaterSelect = this.updatedByColumn ? 'updater.email' : 'NULL';
    const where = [
      this.createdByColumn ? `h.${this.createdByColumn} IS NOT NULL` : null,
      this.updatedByColumn ? `h.${this.updatedByColumn} IS NOT NULL` : null,
    ]
      .filter(Boolean)
      .join(' OR ');

    const query = `
      SELECT
        h.id AS history_id,
        ${creatorSelect} AS creator_email,
        ${updaterSelect} AS updater_email
      FROM ma_tool_workspace_histories h
      ${creatorJoin}
      ${updaterJoin}
      WHERE ${where}
      ORDER BY h.id ASC
      LIMIT $1 OFFSET $2
    `;
    return this.dataSource.query(query, [limit, (offset - 1) * limit]);
  }

  async transform(data: ExtractedWorkspaceHistoryAuthor[]): Promise<WorkspaceHistoryAuthorRelation[]> {
    const emails = data.flatMap((item) => [item.creator_email, item.updater_email]).filter(Boolean);
    const emailToUserId = await this.resolveUserIdsByEmail(emails);

    return data.map((item) => {
      const createdByUserId = item.creator_email ? (emailToUserId.get(item.creator_email.toLowerCase()) ?? null) : null;
      const updatedByUserId = item.updater_email ? (emailToUserId.get(item.updater_email.toLowerCase()) ?? null) : null;

      if (item.creator_email && !createdByUserId) {
        this.logUnresolvedEmail('WorkspaceHistoryAuthors.created_by', item.history_id, item.creator_email);
      }
      if (item.updater_email && !updatedByUserId) {
        this.logUnresolvedEmail('WorkspaceHistoryAuthors.updated_by', item.history_id, item.updater_email);
      }

      return {
        id: item.history_id,
        created_by_user_id: createdByUserId,
        updated_by_user_id: updatedByUserId,
      };
    });
  }

  async load(userRelations: WorkspaceHistoryAuthorRelation[]) {
    const query = `
      UPDATE ma_tool_workspace_histories h
      SET
        created_by_user_id = x.created_by_user_id,
        updated_by_user_id = x.updated_by_user_id
      FROM json_to_recordset($1::json)
      AS x(id INT, created_by_user_id INT, updated_by_user_id INT)
      WHERE h.id = x.id
    `;
    if (!userRelations.length) return;
    await this.dataDestination.query(query, [JSON.stringify(userRelations)]);
  }

  async hasColumn(tableName: string, columnName: string): Promise<boolean> {
    const rows: { exists: boolean }[] = await this.dataSource.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
            AND column_name = $2
        ) AS exists
      `,
      [tableName, columnName],
    );
    return rows[0]?.exists ?? false;
  }

  async firstExistingColumn(tableName: string, candidates: string[]): Promise<string | null> {
    for (const column of candidates) {
      if (await this.hasColumn(tableName, column)) return column;
    }
    return null;
  }

  async resolveUserIdsByEmail(emails: string[]): Promise<Map<string, number>> {
    const normalizedEmails = Array.from(new Set(emails.filter(Boolean).map((email) => email.toLowerCase())));
    if (!normalizedEmails.length) return new Map();

    const users: { id: number; email: string }[] = await this.dataDestination.query(
      `SELECT id, email FROM users WHERE LOWER(email) = ANY($1)`,
      [normalizedEmails],
    );

    return new Map(users.filter((user) => user.email).map((user) => [user.email.toLowerCase(), user.id]));
  }

  logUnresolvedEmail(scope: string, recordId: number, email: string | null) {
    if (email) {
      console.warn(`  [${scope}] Could not resolve email "${email}" for record ${recordId}.`);
    }
  }
}
