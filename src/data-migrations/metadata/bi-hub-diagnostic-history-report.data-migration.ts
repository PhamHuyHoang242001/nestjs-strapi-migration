import { DataSource } from 'typeorm';
import { getOrmConfig } from '../datasource';
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '@configuration/env.config';

interface ExtractedDiagnosticHistory {
  id: number;
  name: string;
  change_log: string;
  version: number;
  diagnostic_files_id: number;
  diagnostic_files_name: string;
  diagnostic_files_url: string;
  diagnostic_files_type: string;
  diagnostic_report_id: number;
  is_change_link: boolean;
  code: string;
  created_at: string;
  updated_at: string;
}

interface DiagnosticHistoryDto {
  id: number;
  name: string;
  change_log: string;
  version: number;
  diagnostic_files_id: number;
  diagnostic_files_name: string;
  diagnostic_files_url: string;
  diagnostic_files_type: string;
  bi_hub_diagnostic_report_id: number;
  is_change_link: boolean;
  code: string;
  created_at: string;
  updated_at: string;
}

export class BiHubDiagnosticHistoryReportDataMigration {
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
    console.log(`[DiagnosticHistoryReportDataMigration] Migrate ${count} records completed.`);
  }

  async extract(offset: number, limit: number): Promise<ExtractedDiagnosticHistory[]> {
    // Strapi v5: relation stored in *_lnk table, not direct FK column
    const query = `
      SELECT
        h.id, h.name, h.change_log, h.version,
        h.diagnostic_files_id, h.diagnostic_files_name,
        h.diagnostic_files_url, h.diagnostic_files_type,
        lnk.bi_diagnostic_report_id AS diagnostic_report_id,
        h.is_change_link, h.code,
        h.created_at, h.updated_at
      FROM bi_diagnostic_history_reports h
      LEFT JOIN bi_diagnostic_history_reports_diagnostic_report_lnk lnk
        ON lnk.bi_diagnostic_history_report_id = h.id
      ORDER BY h.id ASC
      LIMIT $1 OFFSET $2
    `;
    return this.dataSource.query(query, [limit, (offset - 1) * limit]);
  }

  transform(data: ExtractedDiagnosticHistory[]): { data: DiagnosticHistoryDto[]; columns: string[] } {
    const columns = [
      'id',
      'name',
      'change_log',
      'version',
      'diagnostic_files_id',
      'diagnostic_files_name',
      'diagnostic_files_url',
      'diagnostic_files_type',
      'bi_hub_diagnostic_report_id',
      'is_change_link',
      'code',
      'created_at',
      'updated_at',
    ];

    const transforms = data.map((item) => ({
      id: item.id,
      name: item.name,
      change_log: item.change_log,
      version: item.version ?? 0,
      diagnostic_files_id: item.diagnostic_files_id ?? null,
      diagnostic_files_name: item.diagnostic_files_name,
      diagnostic_files_url: item.diagnostic_files_url,
      diagnostic_files_type: item.diagnostic_files_type,
      bi_hub_diagnostic_report_id: item.diagnostic_report_id ?? null,
      is_change_link: item.is_change_link ?? false,
      code: item.code,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));

    return { data: transforms, columns };
  }

  async resetSequence() {
    await this.dataDestination.query(`
      SELECT setval(
        'bi_hub_diagnostic_history_reports_id_seq',
        COALESCE((SELECT MAX(id) FROM bi_hub_diagnostic_history_reports), 1)
      )
    `);
  }

  async load(data: DiagnosticHistoryDto[], columns: string[]) {
    if (!data.length) return;
    const query = `
      INSERT INTO bi_hub_diagnostic_history_reports (${columns.join(',')})
      SELECT
        id, name, change_log, version,
        diagnostic_files_id, diagnostic_files_name, diagnostic_files_url, diagnostic_files_type,
        bi_hub_diagnostic_report_id, is_change_link, code, created_at, updated_at
      FROM json_to_recordset($1::json)
      AS x(
        id INT, name TEXT, change_log JSON, version INT,
        diagnostic_files_id INT, diagnostic_files_name TEXT,
        diagnostic_files_url TEXT, diagnostic_files_type TEXT,
        bi_hub_diagnostic_report_id INT, is_change_link BOOLEAN,
        code TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
      )
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name, change_log = EXCLUDED.change_log, version = EXCLUDED.version,
        diagnostic_files_id = EXCLUDED.diagnostic_files_id,
        diagnostic_files_name = EXCLUDED.diagnostic_files_name,
        diagnostic_files_url = EXCLUDED.diagnostic_files_url,
        diagnostic_files_type = EXCLUDED.diagnostic_files_type,
        bi_hub_diagnostic_report_id = EXCLUDED.bi_hub_diagnostic_report_id,
        is_change_link = EXCLUDED.is_change_link, code = EXCLUDED.code,
        updated_at = EXCLUDED.updated_at
    `;
    await this.dataDestination.query(query, [JSON.stringify(data)]);
  }
}
