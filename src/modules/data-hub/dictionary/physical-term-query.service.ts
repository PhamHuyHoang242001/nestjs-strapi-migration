import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { escapeLike, liveSql, searchTerm, toPaging } from '../common/data-hub-query.util';
import { termOfActiveServiceSql } from '../common/source-table-groups.util';
import { ListAvailablePhysicalTermQueryDto } from './dto';

interface TermRow {
  id: number;
  code: string;
  technical_description: string;
  data_type: string | null;
  is_required: boolean;
  example_value: string | null;
  logical_id: number | null;
  logical_code: string | null;
  st_id: number;
  st_name: string;
  ds_id: number;
  service_code: string;
  service_name: string | null;
}

// A term whose logical parent was soft-deleted reads as unmapped (the parent join is live-only).
const FROM_SQL = `FROM data_hub_physical_terms p
   JOIN data_hub_source_tables st ON st.id = p.source_table_id
   JOIN data_hub_data_services s ON s.id = p.data_service_id
   LEFT JOIN data_hub_data_service_versions v ON v.id = s.active_version_id
   LEFT JOIN data_hub_logical_terms lt ON lt.id = p.logical_term_id AND ${liveSql('lt')}`;

@Injectable()
export class PhysicalTermQueryService {
  constructor(private readonly dataSource: DataSource) {}

  // Picker for the logical create/edit form: unmapped terms of live services, plus those already on
  // logical_term_id. Codes repeat across source tables, so each item names its table and service.
  async available(q: ListAvailablePhysicalTermQueryDto) {
    const params: unknown[] = [];
    const conds = [termOfActiveServiceSql('p')];
    const search = searchTerm(q.keyword);
    if (search) {
      params.push(`%${escapeLike(search)}%`);
      const n = params.length;
      conds.push(`(p.code ILIKE $${n} ESCAPE '\\' OR p.technical_description ILIKE $${n} ESCAPE '\\'
                   OR st.name ILIKE $${n} ESCAPE '\\' OR s.service_code ILIKE $${n} ESCAPE '\\')`);
    }
    if (q.logical_term_id !== undefined) {
      params.push(q.logical_term_id);
      conds.push(`(p.logical_term_id IS NULL OR p.logical_term_id = $${params.length})`);
    } else {
      conds.push('p.logical_term_id IS NULL');
    }
    const where = `${FROM_SQL} WHERE ${conds.join(' AND ')}`;
    const { page, limit, offset } = toPaging(q);
    const [{ total }] = await this.dataSource.query<Array<{ total: number }>>(
      `SELECT COUNT(*)::int AS total ${where}`,
      params,
    );
    const rows: TermRow[] = await this.dataSource.query(
      `SELECT p.id, p.code, p.technical_description, p.data_type, p.is_required, p.example_value, lt.id AS logical_id, lt.code AS logical_code,
              st.id AS st_id, st.name AS st_name, s.id AS ds_id, s.service_code, v.name AS service_name
       ${where} ORDER BY st.name, p.code, p.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return {
      data: rows.map((r) => ({
        id: Number(r.id),
        code: r.code,
        technical_description: r.technical_description,
        data_type: r.data_type,
        is_required: r.is_required,
        example_value: r.example_value,
        logical_term: r.logical_id === null ? null : { id: Number(r.logical_id), code: r.logical_code },
        source_table: { id: Number(r.st_id), name: r.st_name },
        data_service: { id: Number(r.ds_id), service_code: r.service_code, name: r.service_name ?? '' },
      })),
      meta: { total, page, limit },
    };
  }
}
