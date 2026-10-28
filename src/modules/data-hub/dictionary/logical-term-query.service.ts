import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataHubUserRefService } from '../common/data-hub-user-ref.service';
import { DataHubPageQueryDto, escapeLike, liveSql, searchTerm, toPaging } from '../common/data-hub-query.util';
import { termOfActiveServiceSql } from '../common/source-table-groups.util';
import { ListLogicalTermQueryDto } from './dto';
import {
  SYSTEMS_OUT_PAIRS_SQL,
  SystemOutRef,
  buildLogicalTermFilter,
  loadSystemsOut,
  unionSystemsOut,
} from './dictionary-systems-out.util';

interface LogicalRow {
  id: number;
  code: string;
  short_description: string;
  example_value: string | null;
}

interface PhysicalRow {
  id: number;
  logical_term_id: number;
  code: string;
  technical_description: string;
  data_type: string | null;
  is_required: boolean;
  example_value: string | null;
  st_id: number;
  st_name: string;
  ds_id: number;
  service_code: string;
}

const LOGICAL_COLUMNS = 'lt.id, lt.code, lt.short_description, lt.example_value';

@Injectable()
export class LogicalTermQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly userRefs: DataHubUserRefService,
  ) {}

  // Light picker (data-service form): live logical terms by code / description, A→Z, only the fields a dropdown needs.
  async options(q: DataHubPageQueryDto) {
    const { page, limit, offset } = toPaging(q);
    const params: unknown[] = [];
    let search = '';
    const text = searchTerm(q.keyword);
    if (text) {
      params.push(`%${escapeLike(text)}%`);
      search = `AND (lt.code ILIKE $1 ESCAPE '\\' OR lt.short_description ILIKE $1 ESCAPE '\\')`;
    }
    const where = `FROM data_hub_logical_terms lt WHERE ${liveSql('lt')} ${search}`;
    const [{ total }] = await this.dataSource.query<Array<{ total: number }>>(
      `SELECT COUNT(*)::int AS total ${where}`,
      params,
    );
    const rows: Array<{ id: number; code: string; short_description: string }> = await this.dataSource.query(
      `SELECT lt.id, lt.code, lt.short_description ${where}
       ORDER BY lt.code, lt.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return { data: rows.map((r) => ({ ...r, id: Number(r.id) })), meta: { total, page, limit } };
  }

  // Paginate logical terms first, then batch-load their physicals and systems out (3 queries per page).
  async list(q: ListLogicalTermQueryDto) {
    const { page, limit, offset } = toPaging(q);
    const params: unknown[] = [];
    const where = [
      liveSql('lt'),
      ...buildLogicalTermFilter({ search: searchTerm(q.keyword), consumer_ids: q.consumer_ids }, params),
    ].join(' AND ');
    const [{ total }] = await this.dataSource.query<Array<{ total: number }>>(
      `SELECT COUNT(*)::int AS total FROM data_hub_logical_terms lt WHERE ${where}`,
      params,
    );
    const rows: LogicalRow[] = await this.dataSource.query(
      `SELECT ${LOGICAL_COLUMNS} FROM data_hub_logical_terms lt
       WHERE ${where} ORDER BY lt.created_at DESC, lt.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return { data: await this.buildTree(rows), meta: { total, page, limit } };
  }

  async getById(id: number) {
    const rows: Array<
      LogicalRow & {
        version_no: number;
        created_by: number;
        updated_by: number | null;
        created_at: Date;
        updated_at: Date;
      }
    > = await this.dataSource.query(
      `SELECT ${LOGICAL_COLUMNS}, lt.version_no, lt.created_by, lt.updated_by, lt.created_at, lt.updated_at
         FROM data_hub_logical_terms lt WHERE lt.id = $1 AND ${liveSql('lt')}`,
      [id],
    );
    if (rows.length === 0) throw new NotFoundException('LOGICAL_TERM_NOT_FOUND');
    const row = rows[0];
    const [item] = await this.buildTree([row]);
    const users = await this.userRefs.resolve([row.created_by, row.updated_by]);
    return {
      ...item,
      version_no: row.version_no,
      created_by_user: this.userRefs.toRef(users, row.created_by),
      updated_by_user: this.userRefs.toRef(users, row.updated_by),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // Filter dropdown: exposed consumers with the number of live physical terms each one receives.
  async systemsOut() {
    const rows: Array<{ id: number; code: string; name: string; term_count: number }> = await this.dataSource.query(
      `SELECT so.consumer_id AS id, so.consumer_code AS code, so.consumer_name AS name,
              COUNT(DISTINCT so.physical_term_id)::int AS term_count
       FROM ${SYSTEMS_OUT_PAIRS_SQL} so
       GROUP BY so.consumer_id, so.consumer_code, so.consumer_name
       ORDER BY so.consumer_code, so.consumer_id`,
    );
    return rows;
  }

  // Physicals of live services under each logical term, with their source table and owning service.
  private async buildTree(rows: LogicalRow[]) {
    if (rows.length === 0) return [];
    const physicals: PhysicalRow[] = await this.dataSource.query(
      `SELECT p.id, p.logical_term_id, p.code, p.technical_description, p.data_type, p.is_required, p.example_value,
              st.id AS st_id, st.name AS st_name, s.id AS ds_id, s.service_code
       FROM data_hub_physical_terms p
       JOIN data_hub_source_tables st ON st.id = p.source_table_id
       JOIN data_hub_data_services s ON s.id = p.data_service_id
       WHERE p.logical_term_id = ANY($1) AND ${termOfActiveServiceSql('p')}
       ORDER BY p.created_at DESC, p.id DESC`,
      [rows.map((r) => r.id)],
    );
    const systems = await loadSystemsOut(
      this.dataSource,
      physicals.map((p) => Number(p.id)),
    );
    const byLogical = new Map<number, Array<PhysicalRow & { systems_out: SystemOutRef[] }>>();
    for (const p of physicals) {
      const list = byLogical.get(Number(p.logical_term_id)) ?? [];
      list.push({ ...p, systems_out: systems.get(Number(p.id)) ?? [] });
      byLogical.set(Number(p.logical_term_id), list);
    }
    return rows.map((r) => {
      const children = byLogical.get(Number(r.id)) ?? [];
      return {
        id: r.id,
        code: r.code,
        short_description: r.short_description,
        example_value: r.example_value,
        systems_out_count: unionSystemsOut(children.map((c) => c.systems_out)).length,
        physical_terms: children.map((c) => ({
          id: c.id,
          code: c.code,
          technical_description: c.technical_description,
          data_type: c.data_type,
          is_required: c.is_required,
          example_value: c.example_value,
          source_table: { id: Number(c.st_id), name: c.st_name },
          data_service: { id: Number(c.ds_id), service_code: c.service_code },
          systems_out: c.systems_out,
        })),
      };
    });
  }
}
