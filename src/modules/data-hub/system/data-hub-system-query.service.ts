import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataHubPageQueryDto, escapeLike, liveSql, searchTerm, toPaging } from '../common/data-hub-query.util';

interface NamedRow {
  id: number;
  name: string;
}

// Paged pickers of the App thụ hưởng form: Hệ thống and Đơn vị chủ quản (live rows only, keyword matches the
// name). Rows are loaded by SQL.
@Injectable()
export class DataHubSystemQueryService {
  constructor(private readonly dataSource: DataSource) {}

  listSystems(q: DataHubPageQueryDto) {
    return this.listByName('data_hub_systems', q);
  }

  listOwnerUnits(q: DataHubPageQueryDto) {
    return this.listByName('data_hub_owner_units', q);
  }

  private async listByName(table: 'data_hub_systems' | 'data_hub_owner_units', q: DataHubPageQueryDto) {
    const { page, limit, offset } = toPaging(q);
    const params: unknown[] = [];
    let where = liveSql('s');
    const text = searchTerm(q.keyword);
    if (text) {
      params.push(`%${escapeLike(text)}%`);
      where += ` AND s.name ILIKE $${params.length} ESCAPE '\\'`;
    }
    const [count]: Array<{ total: number }> = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM ${table} s WHERE ${where}`,
      params,
    );
    const rows: NamedRow[] = await this.dataSource.query(
      `SELECT s.id, s.name FROM ${table} s WHERE ${where}
       ORDER BY s.name, s.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return {
      data: rows.map((r) => ({ id: Number(r.id), name: r.name })),
      meta: { total: Number(count?.total ?? 0), page, limit },
    };
  }
}
