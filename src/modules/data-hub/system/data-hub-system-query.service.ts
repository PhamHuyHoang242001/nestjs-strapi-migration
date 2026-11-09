import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataHubPageQueryDto, escapeLike, liveSql, searchTerm, toPaging } from '../common/data-hub-query.util';

interface SystemRow {
  id: number;
  name: string;
}

// Paged picker for Hệ thống (live rows only, keyword matches the name). Rows are loaded by SQL.
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
}
