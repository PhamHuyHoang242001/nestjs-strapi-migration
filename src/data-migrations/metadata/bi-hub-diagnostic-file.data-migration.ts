import { DataSource } from 'typeorm';
import { getOrmConfig } from '../datasource';
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '@configuration/env.config';

interface ExtractedDiagnosticFile {
  id: number;
  file_url: string;
  type: string;
  name: string;
  diagnostic_report_id: number;
  lastest_version: boolean;
  file_status: string;
  created_at: string;
  updated_at: string;
}

interface DiagnosticFileDto {
  id: number;
  file_url: string;
  type: string;
  name: string;
  bi_hub_diagnostic_report_id: number;
  lastest_version: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

export class BiHubDiagnosticFileDataMigration {
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
      const { data, columns } = this.transform(raws);
      await this.load(data, columns);

      if (raws.length < limit) {
        isFetch = false;
      }

      count += raws.length;
      offset += 1;
    }

    await this.resetSequence();
    console.log(`[DiagnosticFileDataMigration] Migrate ${count} records completed.`);
  }

  async extract(offset: number, limit: number): Promise<ExtractedDiagnosticFile[]> {
    // Strapi v5: relation stored in *_lnk table, not direct FK column
    const query = `
      SELECT
        f.id, f.file_url, f.type, f.name,
        lnk.bi_diagnostic_report_id AS diagnostic_report_id,
        f.lastest_version, f.file_status,
        f.created_at, f.updated_at
      FROM bi_diagnostic_files f
      LEFT JOIN bi_diagnostic_files_diagnostic_report_lnk lnk
        ON lnk.bi_diagnostic_file_id = f.id
      ORDER BY f.id ASC
      LIMIT $1 OFFSET $2
    `;
    return this.dataSource.query(query, [limit, (offset - 1) * limit]);
  }

  transform(data: ExtractedDiagnosticFile[]): { data: DiagnosticFileDto[]; columns: string[] } {
    const columns = [
      'id',
      'file_url',
      'type',
      'name',
      'bi_hub_diagnostic_report_id',
      'lastest_version',
      'status',
      'created_at',
      'updated_at',
    ];

    const transforms = data.map((item) => ({
      id: item.id,
      file_url: item.file_url,
      type: item.type,
      name: item.name,
      bi_hub_diagnostic_report_id: item.diagnostic_report_id ?? null,
      lastest_version: item.lastest_version ?? null,
      status: item.file_status ?? null,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));

    return { data: transforms, columns };
  }

  async resetSequence() {
    await this.dataDestination.query(`
      SELECT setval('bi_hub_diagnostic_files_id_seq', COALESCE((SELECT MAX(id) FROM bi_hub_diagnostic_files), 1))
    `);
  }

  async load(data: DiagnosticFileDto[], columns: string[]) {
    if (!data.length) return;
    const query = `
      INSERT INTO bi_hub_diagnostic_files (${columns.join(',')})
      SELECT
        id, file_url, type, name, bi_hub_diagnostic_report_id,
        lastest_version, status, created_at, updated_at
      FROM json_to_recordset($1::json)
      AS x(
        id INT, file_url TEXT, type TEXT, name TEXT,
        bi_hub_diagnostic_report_id INT, lastest_version BOOLEAN,
        status TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
      )
      ON CONFLICT (id)
      DO UPDATE SET
        file_url = EXCLUDED.file_url, type = EXCLUDED.type, name = EXCLUDED.name,
        bi_hub_diagnostic_report_id = EXCLUDED.bi_hub_diagnostic_report_id,
        lastest_version = EXCLUDED.lastest_version, status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at
    `;
    await this.dataDestination.query(query, [JSON.stringify(data)]);
  }
}
