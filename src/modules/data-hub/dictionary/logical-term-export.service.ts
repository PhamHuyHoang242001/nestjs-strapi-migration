import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { liveSql, searchTerm } from '../common/data-hub-query.util';
import { ListLogicalTermQueryDto } from './dto';
import { buildLogicalTermFilter } from './dictionary-systems-out.util';

export const EXPORT_ROW_CAP = 5000;

// Export of logical terms in the import template's columns (STT, Thuật ngữ Chuẩn hoá (Logical Term), Mô tả, Ví dụ):
// one row per term matching the list filters, newest first. Physical terms are exported with their source tables
// (Bảng nguồn thuật ngữ export of the data services).
@Injectable()
export class LogicalTermExportService {
  constructor(private readonly dataSource: DataSource) {}

  async buildRows(q: ListLogicalTermQueryDto): Promise<Array<Record<string, unknown>>> {
    const params: unknown[] = [];
    const where = [
      liveSql('lt'),
      ...buildLogicalTermFilter({ search: searchTerm(q.keyword), consumer_ids: q.consumer_ids }, params),
    ].join(' AND ');
    params.push(EXPORT_ROW_CAP);
    const rows: Array<{ code: string; short_description: string; example_value: string | null }> =
      await this.dataSource.query(
        `SELECT lt.code, lt.short_description, lt.example_value
         FROM data_hub_logical_terms lt
         WHERE ${where}
         ORDER BY lt.created_at DESC, lt.id DESC
         LIMIT $${params.length}`,
        params,
      );
    return rows.map((r) => ({
      code: r.code,
      short_description: r.short_description,
      example_value: r.example_value ?? '',
    }));
  }
}
