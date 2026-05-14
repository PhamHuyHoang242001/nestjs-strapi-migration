import { DataSource } from 'typeorm';
import { getOrmConfig } from '../datasource';
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '@configuration/env.config';

interface ExtractedWorkspaceHistory {
  id: number;
  workspace_id: number | null;
  change_log: unknown;
  created_at: string;
  updated_at: string;
}

export class MaToolWorkspaceHistoryDto {
  id: number;
  workspace_id: number | null;
  change_log: unknown;
  created_at: string;
  updated_at: string;
}

export class MaToolWorkspaceHistoryDataMigration {
  private dataDestination: DataSource;
  private dataSource: DataSource;
  private workspaceSelect: string | null = null;
  private workspaceJoin = '';

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
      const { data, columns } = this.transform(raws);
      await this.load(data, columns);

      if (raws.length < limit) {
        isFetch = false;
      }

      count += raws.length;
      offset += 1;
    }

    await this.resetSequence();

    console.log(`[MaToolWorkspaceHistoryDataMigration] Migrate ${count} records completed.`);
  }

  async prepareSourceShape() {
    if (await this.hasColumn('ma_tool_workspace_histories', 'workspace_id')) {
      this.workspaceSelect = 'h.workspace_id';
      return;
    }

    if (await this.hasTable('ma_tool_workspace_histories_workspace_lnk')) {
      this.workspaceSelect = 'workspace_lnk.ma_tool_workspace_id';
      this.workspaceJoin = `
        LEFT JOIN LATERAL (
          SELECT ma_tool_workspace_id
          FROM ma_tool_workspace_histories_workspace_lnk
          WHERE ma_tool_workspace_history_id = h.id
          LIMIT 1
        ) workspace_lnk ON TRUE
      `;
      return;
    }

    throw new Error(
      'Cannot find workspace relation for ma_tool_workspace_histories. Checked workspace_id and ma_tool_workspace_histories_workspace_lnk.',
    );
  }

  async extract(offset: number, limit: number): Promise<ExtractedWorkspaceHistory[]> {
    const query = `
      SELECT
        h.id,
        ${this.workspaceSelect} AS workspace_id,
        h.change_log,
        h.created_at,
        h.updated_at
      FROM ma_tool_workspace_histories h
      ${this.workspaceJoin}
      ORDER BY h.id ASC
      LIMIT $1 OFFSET $2
    `;
    return this.dataSource.query(query, [limit, (offset - 1) * limit]);
  }

  transform(data: ExtractedWorkspaceHistory[]): { data: MaToolWorkspaceHistoryDto[]; columns: string[] } {
    const transforms = data.map((item) => {
      return {
        id: item.id,
        workspace_id: item.workspace_id,
        change_log: item.change_log,
        created_at: item.created_at,
        updated_at: item.updated_at,
      } as MaToolWorkspaceHistoryDto;
    });

    return {
      data: transforms,
      columns: ['id', 'workspace_id', 'change_log', 'created_at', 'updated_at'],
    };
  }

  async resetSequence() {
    await this.dataDestination.query(`
      SELECT setval(
        'ma_tool_workspace_histories_id_seq',
        COALESCE((SELECT MAX(id) FROM ma_tool_workspace_histories), 1)
      )
    `);
  }

  async load(data: MaToolWorkspaceHistoryDto[], columns: string[]) {
    const query = `
      INSERT INTO ma_tool_workspace_histories (${columns.join(',')})
      SELECT x.id, x.workspace_id, x.change_log, x.created_at, x.updated_at
      FROM json_to_recordset($1::json)
      AS x(
        id INT,
        workspace_id INT,
        change_log JSON,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
      )
      INNER JOIN ma_tool_workspaces w ON w.id = x.workspace_id
      ON CONFLICT (id)
      DO UPDATE SET
        workspace_id = EXCLUDED.workspace_id,
        change_log = EXCLUDED.change_log,
        updated_at = EXCLUDED.updated_at
    `;
    if (!data.length) return;
    await this.dataDestination.query(query, [JSON.stringify(data)]);
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
}
