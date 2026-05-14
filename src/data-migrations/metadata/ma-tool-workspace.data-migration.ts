import { DataSource } from 'typeorm';
import { getOrmConfig } from '../datasource';
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '@configuration/env.config';

interface ExtractedWorkspace {
  id: number;
  name: string | null;
  fullname: string | null;
  description: string | null;
  image_url: string | null;
  workspace_status: string | null;
  storage_type: string | null;
  s3_id: number | null;
  is_deleted: boolean | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export class MaToolWorkspaceDto {
  id: number;
  name: string | null;
  fullname: string | null;
  description: string | null;
  image_url: string | null;
  status: string | null;
  storage_type: string | null;
  s3_id: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export class MaToolWorkspaceDataMigration {
  private dataDestination: DataSource;
  private dataSource: DataSource;
  private s3Select: string | null = null;
  private s3Join = '';

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

    console.log(`[MaToolWorkspaceDataMigration] Migrate ${count} records completed.`);
  }

  async prepareSourceShape() {
    if (await this.hasColumn('ma_tool_workspaces', 's3_id')) {
      this.s3Select = 'w.s3_id';
      return;
    }

    if (await this.hasTable('ma_tool_workspaces_s3_lnk')) {
      this.s3Select = 's3_lnk.ma_tool_s_3_id';
      this.s3Join = `
        LEFT JOIN LATERAL (
          SELECT ma_tool_s_3_id
          FROM ma_tool_workspaces_s3_lnk
          WHERE ma_tool_workspace_id = w.id
          LIMIT 1
        ) s3_lnk ON TRUE
      `;
      return;
    }

    this.s3Select = 'NULL';
  }

  async extract(offset: number, limit: number): Promise<ExtractedWorkspace[]> {
    const query = `
      SELECT
        w.id,
        w.name,
        w.fullname,
        w.description,
        w.image_url,
        w.workspace_status,
        w.storage_type,
        ${this.s3Select} AS s3_id,
        COALESCE(w.is_deleted, false) AS is_deleted,
        w.deleted_at,
        w.created_at,
        w.updated_at
      FROM ma_tool_workspaces w
      ${this.s3Join}
      WHERE w.workspace_status <> 'draft'
      ORDER BY w.id ASC
      LIMIT $1 OFFSET $2
    `;
    return this.dataSource.query(query, [limit, (offset - 1) * limit]);
  }

  transform(data: ExtractedWorkspace[]): { data: MaToolWorkspaceDto[]; columns: string[] } {
    const transforms = data.map((item) => {
      return {
        id: item.id,
        name: item.name,
        fullname: item.fullname,
        description: item.description,
        image_url: item.image_url,
        status: item.workspace_status,
        storage_type: item.storage_type,
        s3_id: item.s3_id,
        deleted_at: item.deleted_at ?? (item.is_deleted ? item.updated_at : null),
        created_at: item.created_at,
        updated_at: item.updated_at,
      } as MaToolWorkspaceDto;
    });

    return {
      data: transforms,
      columns: [
        'id',
        'name',
        'fullname',
        'description',
        'image_url',
        'status',
        'storage_type',
        's3_id',
        'deleted_at',
        'created_at',
        'updated_at',
      ],
    };
  }

  async resetSequence() {
    await this.dataDestination.query(`
      SELECT setval(
        'ma_tool_workspaces_id_seq',
        COALESCE((SELECT MAX(id) FROM ma_tool_workspaces), 1)
      )
    `);
  }

  async load(data: MaToolWorkspaceDto[], columns: string[]) {
    const query = `
      INSERT INTO ma_tool_workspaces (${columns.join(',')})
      SELECT
        id, name, fullname, description, image_url, status,
        storage_type, s3_id, deleted_at, created_at, updated_at
      FROM json_to_recordset($1::json)
      AS x(
        id INT,
        name TEXT,
        fullname TEXT,
        description TEXT,
        image_url TEXT,
        status TEXT,
        storage_type TEXT,
        s3_id INT,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
      )
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        fullname = EXCLUDED.fullname,
        description = EXCLUDED.description,
        image_url = EXCLUDED.image_url,
        status = EXCLUDED.status,
        storage_type = EXCLUDED.storage_type,
        s3_id = EXCLUDED.s3_id,
        deleted_at = EXCLUDED.deleted_at,
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
