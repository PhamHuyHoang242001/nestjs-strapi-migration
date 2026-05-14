import { DataSource } from 'typeorm';
import { getOrmConfig } from '../datasource';
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '@configuration/env.config';

interface ExtractedWorkspaceBookmarkUser {
  bookmark_id: number;
  user_email: string | null;
}

interface WorkspaceBookmarkUserRelation {
  id: number;
  user_id: number | null;
}

export class MaToolWorkspaceBookmarkRelationDataMigration {
  private dataDestination: DataSource;
  private dataSource: DataSource;
  private userSelect: string | null = null;
  private userJoin = '';
  private userTable: string | null = null;

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

    console.log(`[MaToolWorkspaceBookmarkRelation] Migrate ${count} records completed.`);
  }

  async prepareSourceShape() {
    this.userTable = await this.resolveSourceUserTable();
    const directUserColumn = await this.firstExistingColumn('ma_tool_workspace_bookmarks', ['user_id']);

    if (directUserColumn) {
      this.userSelect = 'source_user.email';
      this.userJoin = `LEFT JOIN ${this.userTable} source_user ON b.${directUserColumn} = source_user.id`;
      return;
    }

    if (await this.hasTable('ma_tool_workspace_bookmarks_user_lnk')) {
      this.userSelect = 'source_user.email';
      this.userJoin = `
        LEFT JOIN LATERAL (
          SELECT user_id
          FROM ma_tool_workspace_bookmarks_user_lnk
          WHERE ma_tool_workspace_bookmark_id = b.id
          LIMIT 1
        ) user_lnk ON TRUE
        LEFT JOIN ${this.userTable} source_user ON user_lnk.user_id = source_user.id
      `;
      return;
    }

    throw new Error(
      'Cannot find user relation for ma_tool_workspace_bookmarks. Checked user_id and ma_tool_workspace_bookmarks_user_lnk.',
    );
  }

  async resolveSourceUserTable(): Promise<string> {
    const candidates = ['up_users', 'feedback_users'];
    for (const tableName of candidates) {
      const isMatch =
        (await this.hasTable(tableName)) &&
        (await this.hasColumn(tableName, 'id')) &&
        (await this.hasColumn(tableName, 'email'));
      if (isMatch) return tableName;
    }
    throw new Error('Cannot find source users table. Checked up_users and feedback_users.');
  }

  async extract(offset: number, limit: number): Promise<ExtractedWorkspaceBookmarkUser[]> {
    const query = `
      SELECT
        b.id AS bookmark_id,
        ${this.userSelect} AS user_email
      FROM ma_tool_workspace_bookmarks b
      ${this.userJoin}
      ORDER BY b.id ASC
      LIMIT $1 OFFSET $2
    `;
    return this.dataSource.query(query, [limit, (offset - 1) * limit]);
  }

  async transform(data: ExtractedWorkspaceBookmarkUser[]): Promise<WorkspaceBookmarkUserRelation[]> {
    const emails = data.map((item) => item.user_email).filter(Boolean);
    const emailToUserId = await this.resolveUserIdsByEmail(emails);

    return data.map((item) => {
      const userId = item.user_email ? (emailToUserId.get(item.user_email.toLowerCase()) ?? null) : null;

      if (item.user_email && !userId) {
        this.logUnresolvedEmail('BookmarkUsers.user', item.bookmark_id, item.user_email);
      }

      return {
        id: item.bookmark_id,
        user_id: userId,
      };
    });
  }

  async load(userRelations: WorkspaceBookmarkUserRelation[]) {
    const query = `
      UPDATE ma_tool_workspace_bookmarks b
      SET user_id = x.user_id
      FROM json_to_recordset($1::json)
      AS x(id INT, user_id INT)
      WHERE b.id = x.id
    `;
    if (!userRelations.length) return;
    await this.dataDestination.query(query, [JSON.stringify(userRelations)]);
  }

  async hasTable(tableName: string): Promise<boolean> {
    const rows: { exists: boolean }[] = await this.dataSource.query(`SELECT to_regclass($1) IS NOT NULL AS exists`, [
      `public.${tableName}`,
    ]);
    return rows[0]?.exists ?? false;
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
