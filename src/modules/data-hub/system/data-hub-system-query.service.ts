import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataHubPageQueryDto, escapeLike, liveSql, searchTerm, toPaging } from '../common/data-hub-query.util';
import { ListSystemServiceQueryDto } from './dto/list-system-service-query.dto';

interface SystemRow {
  id: number;
  name: string;
}

interface SystemServiceRow extends SystemRow {
  system_id: number;
  system_name: string;
}

// Paged pickers for Hệ thống and Dịch vụ hệ thống (live rows only, keyword matches the name). Rows are loaded by SQL.
@Injectable()
export class DataHubSystemQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async listSystems(q: DataHubPageQueryDto) {
    const { page, limit, offset } = toPaging(q);
    const params: unknown[] = [];
    let where = liveSql('s');
    const text = searchTerm(q.keyword);
    if (text) {
      params.push(`%${escapeLike(text)}%`);
      where += ` AND s.name ILIKE $${params.length} ESCAPE '\\'`;
    }
    const [count]: Array<{ total: number }> = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM data_hub_systems s WHERE ${where}`,
      params,
    );
    const rows: SystemRow[] = await this.dataSource.query(
      `SELECT s.id, s.name FROM data_hub_systems s WHERE ${where}
       ORDER BY s.name, s.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return {
      data: rows.map((r) => ({ id: Number(r.id), name: r.name })),
      meta: { total: Number(count?.total ?? 0), page, limit },
    };
  }

  // A service of a deleted system is hidden with it.
  async listSystemServices(q: ListSystemServiceQueryDto) {
    const { page, limit, offset } = toPaging(q);
    const params: unknown[] = [];
    let where = `${liveSql('sv')} AND ${liveSql('s')}`;
    if (q.system_id) {
      params.push(q.system_id);
      where += ` AND sv.system_id = $${params.length}`;
    }
    const text = searchTerm(q.keyword);
    if (text) {
      params.push(`%${escapeLike(text)}%`);
      where += ` AND sv.name ILIKE $${params.length} ESCAPE '\\'`;
    }
    const from = `FROM data_hub_system_services sv JOIN data_hub_systems s ON s.id = sv.system_id`;
    const [count]: Array<{ total: number }> = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total ${from} WHERE ${where}`,
      params,
    );
    const rows: SystemServiceRow[] = await this.dataSource.query(
      `SELECT sv.id, sv.name, s.id AS system_id, s.name AS system_name ${from} WHERE ${where}
       ORDER BY sv.name, sv.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return {
      data: rows.map((r) => ({
        id: Number(r.id),
        name: r.name,
        system: { id: Number(r.system_id), name: r.system_name },
      })),
      meta: { total: Number(count?.total ?? 0), page, limit },
    };
  }
}
