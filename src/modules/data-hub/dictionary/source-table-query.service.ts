import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataHubAccessService, DataHubCaller } from '../common/data-hub-access.service';
import { DataHubPageQueryDto, escapeLike, liveSql, searchTerm, toPaging } from '../common/data-hub-query.util';
import {
  dictionaryScope,
  listGroupTerms,
  listSourceTableGroupsWithTerms,
  sourceTableScopeSql,
  termOfActiveServiceSql,
} from '../common/source-table-groups.util';
import { SelectableSourceTableQueryDto } from './dto';

// Bảng nguồn dịch vụ in the dictionary (read-only: tables and terms are written from the data-service form).
@Injectable()
export class SourceTableQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: DataHubAccessService,
  ) {}

  // "Thuật ngữ nghiệp vụ" tab: tables holding terms of live services, paged, plus the departments they serve and
  // their terms (nested like the physicals of the logical list, so expanding a row needs no extra call).
  async list(q: DataHubPageQueryDto) {
    const res = await listSourceTableGroupsWithTerms(this.dataSource, dictionaryScope(), q);
    const departments = await this.departmentsOf(res.data.map((g) => g.id));
    return { ...res, data: res.data.map((g) => ({ ...g, departments: departments.get(g.id) ?? [] })) };
  }

  async terms(id: number) {
    await this.assertLive(id);
    return { data: await listGroupTerms(this.dataSource, dictionaryScope(), id) };
  }

  // Picker of the data-service form: tables of the caller's departments (see sourceTableScopeSql), listed right
  // away without choosing the Đơn vị phát hành first; term_count counts every live term in the table.
  async selectable(caller: DataHubCaller, q: SelectableSourceTableQueryDto) {
    const { page, limit, offset } = toPaging(q);
    const scope = await this.access.sourceTableDepartmentIds(caller);
    const params: unknown[] = [scope, q.data_service_id ?? null];
    let search = '';
    const text = searchTerm(q.keyword);
    if (text) {
      params.push(`%${escapeLike(text)}%`);
      search = `AND (st.name ILIKE $3 ESCAPE '\\' OR st.description ILIKE $3 ESCAPE '\\')`;
    }
    const where = `FROM data_hub_source_tables st
      WHERE ${liveSql('st')} AND ${sourceTableScopeSql('$1::int[]', '$2::int')} ${search}`;
    const [{ total }] = await this.dataSource.query<Array<{ total: number }>>(
      `SELECT COUNT(*)::int AS total ${where}`,
      params,
    );
    const rows: Array<{ id: number; name: string; description: string | null; term_count: number }> =
      await this.dataSource.query(
        `SELECT st.id, st.name, st.description,
                (SELECT COUNT(*)::int FROM data_hub_physical_terms p
                 WHERE p.source_table_id = st.id AND ${termOfActiveServiceSql('p')}) AS term_count
         ${where} ORDER BY st.name, st.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
    const departments = await this.departmentsOf(rows.map((r) => Number(r.id)));
    return {
      data: rows.map((r) => ({
        ...r,
        id: Number(r.id),
        term_count: Number(r.term_count),
        departments: departments.get(Number(r.id)) ?? [],
      })),
      meta: { total, page, limit },
    };
  }

  // Department of the creating service plus departments of active services' active versions holding its terms.
  private async departmentsOf(ids: number[]): Promise<Map<number, Array<{ id: number; code: string; name: string }>>> {
    const out = new Map<number, Array<{ id: number; code: string; name: string }>>();
    if (ids.length === 0) return out;
    const rows: Array<{ st_id: number; id: number; code: string; name: string }> = await this.dataSource.query(
      `SELECT DISTINCT x.st_id, d.id, d.code, d.name FROM (
         SELECT st.id AS st_id, st.department_id AS dept_id FROM data_hub_source_tables st WHERE st.id = ANY($1)
         UNION
         SELECT p.source_table_id, v.department_id FROM data_hub_physical_terms p
         JOIN data_hub_data_services s ON s.id = p.data_service_id
         JOIN data_hub_data_service_versions v ON v.id = s.active_version_id
         WHERE p.source_table_id = ANY($1) AND ${termOfActiveServiceSql('p')}
       ) x JOIN data_hub_departments d ON d.id = x.dept_id
       ORDER BY d.code`,
      [ids],
    );
    for (const r of rows) {
      const list = out.get(Number(r.st_id)) ?? [];
      list.push({ id: Number(r.id), code: r.code, name: r.name });
      out.set(Number(r.st_id), list);
    }
    return out;
  }

  private async assertLive(id: number): Promise<void> {
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM data_hub_source_tables st WHERE st.id = $1 AND ${liveSql('st')}`,
      [id],
    );
    if (rows.length === 0) throw new NotFoundException('SOURCE_TABLE_NOT_FOUND');
  }
}
