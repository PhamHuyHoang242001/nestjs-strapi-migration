import { DataSource } from 'typeorm';
import { getOrmConfig } from '../datasource';
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '@configuration/env.config';

interface ExtractedDiagnosticReport {
  id: number;
  name: string;
  is_sensitive: boolean;
  diagnostic_report_status: string;
  icon: string;
  bu_name: string;
  is_deleted: boolean;
  version: number;
  is_change_link: boolean;
  total_view: number;
  txt_diagnostic_scope: string;
  summary: string;
  insight: string;
  code: string;
  bicc_department_id: number;
  created_at: string;
  updated_at: string;
}

interface DiagnosticReportDto {
  id: number;
  name: string;
  is_sensitive: boolean;
  status: string;
  icon: string;
  bu_name: string;
  is_deleted: boolean;
  version: number;
  is_change_link: boolean;
  total_view: number;
  txt_diagnostic_scope: string;
  summary: string;
  insight: string;
  code: string;
  bicc_department_id: number;
  created_at: string;
  updated_at: string;
}

export class BiHubDiagnosticReportDataMigration {
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
    console.log(`[DiagnosticReportDataMigration] Migrate ${count} records completed.`);
  }

  async extract(offset: number, limit: number): Promise<ExtractedDiagnosticReport[]> {
    // Resolve bicc_department_id through category layer (category removed in NestJS)
    const query = `
      SELECT
        r.id, r.name, r.is_sensitive, r.diagnostic_report_status,
        r.icon, r.bu_name, r.is_deleted, r.version, r.is_change_link,
        r.total_view, r.txt_diagnostic_scope, r.summary, r.insight, r.code,
        cat.bicc_department_id,
        r.created_at, r.updated_at
      FROM bi_diagnostic_reports r
      LEFT JOIN bi_diagnostic_categories cat ON r.bi_diagnostic_category_id = cat.id
      ORDER BY r.id ASC
      LIMIT $1 OFFSET $2
    `;
    return this.dataSource.query(query, [limit, (offset - 1) * limit]);
  }

  transform(data: ExtractedDiagnosticReport[]): { data: DiagnosticReportDto[]; columns: string[] } {
    const columns = [
      'id',
      'name',
      'is_sensitive',
      'status',
      'icon',
      'bu_name',
      'is_deleted',
      'version',
      'is_change_link',
      'total_view',
      'txt_diagnostic_scope',
      'summary',
      'insight',
      'code',
      'bicc_department_id',
      'created_at',
      'updated_at',
    ];

    const transforms = data.map((item) => ({
      id: item.id,
      name: item.name,
      is_sensitive: item.is_sensitive ?? false,
      status: item.diagnostic_report_status ?? null,
      icon: item.icon,
      bu_name: item.bu_name,
      is_deleted: item.is_deleted ?? false,
      version: item.version ?? 0,
      is_change_link: item.is_change_link ?? false,
      total_view: item.total_view ?? 0,
      txt_diagnostic_scope: item.txt_diagnostic_scope,
      summary: item.summary,
      insight: item.insight,
      code: item.code,
      bicc_department_id: item.bicc_department_id ?? null,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));

    return { data: transforms, columns };
  }

  async resetSequence() {
    await this.dataDestination.query(`
      SELECT setval('bi_hub_diagnostic_reports_id_seq', COALESCE((SELECT MAX(id) FROM bi_hub_diagnostic_reports), 1))
    `);
  }

  async load(data: DiagnosticReportDto[], columns: string[]) {
    if (!data.length) return;
    const query = `
      INSERT INTO bi_hub_diagnostic_reports (${columns.join(',')})
      SELECT
        id, name, is_sensitive, status, icon, bu_name, is_deleted,
        version, is_change_link, total_view, txt_diagnostic_scope,
        summary, insight, code, bicc_department_id, created_at, updated_at
      FROM json_to_recordset($1::json)
      AS x(
        id INT, name TEXT, is_sensitive BOOLEAN, status TEXT, icon TEXT,
        bu_name TEXT, is_deleted BOOLEAN, version INT, is_change_link BOOLEAN,
        total_view INT, txt_diagnostic_scope TEXT, summary TEXT,
        insight JSON, code TEXT, bicc_department_id INT,
        created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
      )
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name, is_sensitive = EXCLUDED.is_sensitive,
        status = EXCLUDED.status, icon = EXCLUDED.icon, bu_name = EXCLUDED.bu_name,
        is_deleted = EXCLUDED.is_deleted, version = EXCLUDED.version,
        is_change_link = EXCLUDED.is_change_link, total_view = EXCLUDED.total_view,
        txt_diagnostic_scope = EXCLUDED.txt_diagnostic_scope, summary = EXCLUDED.summary,
        insight = EXCLUDED.insight, code = EXCLUDED.code,
        bicc_department_id = EXCLUDED.bicc_department_id, updated_at = EXCLUDED.updated_at
    `;
    await this.dataDestination.query(query, [JSON.stringify(data)]);
  }
}
