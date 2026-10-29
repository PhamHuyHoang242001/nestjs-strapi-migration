import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { activeSql, DataHubPageMeta, liveSql, toPaging } from '../common/data-hub-query.util';
import { DataHubUserRef, DataHubUserRefService } from '../common/data-hub-user-ref.service';
import { queryRows } from './data-service-query-rows.util';
import { buildListWhere, LIST_FROM_SQL, ListFilterInput, listOrderBy } from './data-service-list-filter.util';
import { ListDataServiceQueryDto } from './dto';

export interface OrgRef {
  id: number;
  code: string;
  name: string;
}

export interface ListRow {
  id: number;
  service_code: string;
  service_type: string;
  status: string;
  updated_at: Date;
  version_id: number;
  version_no: number;
  name: string;
  short_description: string;
  division_id: number;
  division_code: string;
  division_name: string;
  department_id: number;
  department_code: string;
  department_name: string;
  request_unit_id: number;
  request_unit_code: string;
  request_unit_name: string;
  method: string | null;
  endpoint_path: string | null;
  base_url: string | null;
  update_frequency: string | null;
  flow_direction: string | null;
  export_frequency: string | null;
  file_format: string | null;
  sftp_folder_path: string | null;
}

// Only the columns the catalog card/row and the export need.
const LIST_COLUMNS = `
  s.id, s.service_code, s.service_type, s.status, s.updated_at,
  v.id AS version_id, v.version_no, v.name, v.short_description,
  v.division_id, d.code AS division_code, d.name AS division_name,
  v.department_id, dp.code AS department_code, dp.name AS department_name,
  v.request_unit_id, ru.code AS request_unit_code, ru.name AS request_unit_name,
  a.method, a.endpoint_path, a.base_url, a.update_frequency,
  sf.flow_direction, sf.export_frequency, sf.file_format, sf.folder_path AS sftp_folder_path`;

const ref = (id: number, code: string, name: string): OrgRef => ({ id: Number(id), code, name });

@Injectable()
export class DataHubDataServiceListQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly userRefs: DataHubUserRefService,
  ) {}

  async list(q: ListDataServiceQueryDto): Promise<{ data: unknown[]; meta: DataHubPageMeta }> {
    const { page, limit, offset } = toPaging(q);
    const { where, params } = buildListWhere(q);
    const [countRows, rows] = await Promise.all([
      queryRows<{ total: number }>(
        this.dataSource,
        `SELECT COUNT(*)::int AS total ${LIST_FROM_SQL} WHERE ${where}`,
        params,
      ),
      this.fetchRows(q, limit, offset),
    ]);
    const versionIds = rows.map((r) => r.version_id);
    const [[consumers, termCounts], owners] = await Promise.all([
      this.loadPageRelations(versionIds),
      this.loadServiceOwners(versionIds),
    ]);
    const data = rows.map((r) => ({
      id: Number(r.id),
      service_code: r.service_code,
      service_type: r.service_type,
      status: r.status,
      version_no: Number(r.version_no),
      name: r.name,
      short_description: r.short_description,
      division: ref(r.division_id, r.division_code, r.division_name),
      department: ref(r.department_id, r.department_code, r.department_name),
      request_unit: ref(r.request_unit_id, r.request_unit_code, r.request_unit_name),
      method: r.method,
      endpoint_path: r.endpoint_path,
      flow_direction: r.flow_direction,
      frequency: r.update_frequency ?? r.export_frequency,
      file_format: r.file_format,
      consumers: consumers.get(Number(r.version_id)) ?? [],
      service_owners: owners.get(Number(r.version_id)) ?? [],
      term_count: termCounts.get(Number(r.version_id)) ?? 0,
      updated_at: r.updated_at,
    }));
    return { data, meta: { total: Number(countRows[0]?.total ?? 0), page, limit } };
  }

  // Shared with the export so both apply exactly the same filters and ordering.
  async fetchRows(q: ListFilterInput, limit: number, offset: number): Promise<ListRow[]> {
    const { where, params } = buildListWhere(q);
    const n = params.length;
    return queryRows<ListRow>(
      this.dataSource,
      `SELECT ${LIST_COLUMNS} ${LIST_FROM_SQL} WHERE ${where}
       ORDER BY ${listOrderBy(q.sort_by)} LIMIT $${n + 1} OFFSET $${n + 2}`,
      [...params, limit, offset],
    );
  }

  // SO dịch vụ of every version on the page as { id, email }, in the order they were added (one query + one user lookup).
  private async loadServiceOwners(versionIds: number[]): Promise<Map<number, DataHubUserRef[]>> {
    const out = new Map<number, DataHubUserRef[]>();
    if (versionIds.length === 0) return out;
    const rows = await queryRows<{ version_id: number; user_id: number }>(
      this.dataSource,
      `SELECT l.data_service_version_id AS version_id, l.user_id FROM data_hub_data_service_version_service_owners l
       WHERE l.data_service_version_id = ANY($1) ORDER BY l.id`,
      [versionIds],
    );
    const users = await this.userRefs.resolve(rows.map((r) => r.user_id));
    for (const r of rows) {
      const list = out.get(Number(r.version_id)) ?? [];
      list.push(...this.userRefs.toRefs(users, [Number(r.user_id)]));
      out.set(Number(r.version_id), list);
    }
    return out;
  }

  // Consumers and term counts for a whole page in two queries (no per-row lookups).
  // `withTermCounts: false` skips the term-count query for callers that only need consumers (export).
  async loadPageRelations(
    versionIds: number[],
    { withTermCounts = true }: { withTermCounts?: boolean } = {},
  ): Promise<[Map<number, Array<{ id: number; code: string; name: string }>>, Map<number, number>]> {
    const consumers = new Map<number, Array<{ id: number; code: string; name: string }>>();
    const termCounts = new Map<number, number>();
    if (versionIds.length === 0) return [consumers, termCounts];
    const [consumerRows, termRows] = await Promise.all([
      queryRows<{ version_id: number; id: number; code: string; name: string }>(
        this.dataSource,
        `SELECT vc.data_service_version_id AS version_id, c.id, c.code, c.name
         FROM data_hub_data_service_version_consumers vc
         JOIN data_hub_consumers c ON c.id = vc.consumer_id AND ${activeSql('c')}
         WHERE vc.data_service_version_id = ANY($1)
         ORDER BY c.code`,
        [versionIds],
      ),
      withTermCounts
        ? queryRows<{ version_id: number; term_count: number }>(
            this.dataSource,
            `SELECT vp.data_service_version_id AS version_id, COUNT(*)::int AS term_count
             FROM data_hub_data_service_version_physical_terms vp
             JOIN data_hub_physical_terms pt ON pt.id = vp.physical_term_id AND ${liveSql('pt')}
             WHERE vp.data_service_version_id = ANY($1)
             GROUP BY vp.data_service_version_id`,
            [versionIds],
          )
        : Promise.resolve<Array<{ version_id: number; term_count: number }>>([]),
    ]);
    for (const row of consumerRows) {
      const list = consumers.get(Number(row.version_id)) ?? [];
      list.push({ id: Number(row.id), code: row.code, name: row.name });
      consumers.set(Number(row.version_id), list);
    }
    for (const row of termRows) {
      termCounts.set(Number(row.version_id), Number(row.term_count));
    }
    return [consumers, termCounts];
  }
}
