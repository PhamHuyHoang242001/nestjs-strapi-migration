import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ExcelColumn } from '@common/utils/export-excel.helper';
import { liveSql, searchTerm } from '../common/data-hub-query.util';
import { termOfActiveServiceSql } from '../common/source-table-groups.util';
import { ListLogicalTermQueryDto } from './dto';
import { buildLogicalTermFilter, buildUnmappedPhysicalFilter, loadSystemsOut } from './dictionary-systems-out.util';

export const EXPORT_ROW_CAP = 5000;

export const LOGICAL_TERM_EXPORT_COLUMNS: ExcelColumn[] = [
  { header: 'STT', key: 'stt', width: 8 },
  { header: 'Mã chuẩn hóa', key: 'logical_code', width: 28 },
  { header: 'Mô tả', key: 'logical_description', width: 40 },
  { header: 'Bảng nguồn', key: 'source_table', width: 28 },
  { header: 'Thuật ngữ nghiệp vụ', key: 'code', width: 30 },
  { header: 'Data service', key: 'service_code', width: 20 },
  { header: 'Mô tả kỹ thuật', key: 'technical_description', width: 40 },
  { header: 'Data Type', key: 'data_type', width: 18 },
  { header: 'Bắt buộc', key: 'is_required', width: 10 },
  { header: 'Ví dụ', key: 'example_value', width: 24 },
  { header: 'Hệ thống đầu ra', key: 'systems_out', width: 30 },
];

interface ExportRow {
  physical_id: number;
  logical_code: string | null;
  logical_description: string | null;
  code: string;
  source_table: string;
  service_code: string;
  technical_description: string;
  data_type: string | null;
  is_required: boolean;
  example_value: string | null;
}

@Injectable()
export class LogicalTermExportService {
  constructor(private readonly dataSource: DataSource) {}

  // One row per physical term. Columns of filtered logical terms come first (by logical code),
  // unmapped columns matching the same filters close the sheet.
  async buildRows(q: ListLogicalTermQueryDto): Promise<Record<string, unknown>[]> {
    const filter = { search: searchTerm(q.keyword), consumer_ids: q.consumer_ids };
    const params: unknown[] = [];
    const logicalConds = [liveSql('lt'), ...buildLogicalTermFilter(filter, params)].join(' AND ');
    const mappedWhere = `${termOfActiveServiceSql('p')} AND p.logical_term_id IN (SELECT lt.id FROM data_hub_logical_terms lt WHERE ${logicalConds})`;
    const unmappedWhere = `${termOfActiveServiceSql('p')} AND ${buildUnmappedPhysicalFilter(filter, params).join(' AND ')}`;
    params.push(EXPORT_ROW_CAP);
    const rows: ExportRow[] = await this.dataSource.query(
      `SELECT p.id AS physical_id, lt.code AS logical_code,
              lt.short_description AS logical_description, p.code, st.name AS source_table, s.service_code,
              p.technical_description, p.data_type, p.is_required, p.example_value
       FROM data_hub_physical_terms p
       JOIN data_hub_source_tables st ON st.id = p.source_table_id
       JOIN data_hub_data_services s ON s.id = p.data_service_id
       LEFT JOIN data_hub_logical_terms lt ON lt.id = p.logical_term_id
       WHERE (${mappedWhere}) OR (${unmappedWhere})
       ORDER BY (lt.id IS NULL), lt.created_at DESC, lt.id DESC, p.created_at DESC, p.id DESC
       LIMIT $${params.length}`,
      params,
    );
    const systems = await loadSystemsOut(
      this.dataSource,
      rows.map((r) => Number(r.physical_id)),
    );
    return rows.map((r, i) => ({
      stt: i + 1,
      logical_code: r.logical_code ?? '',
      logical_description: r.logical_description ?? '',
      source_table: r.source_table,
      code: r.code,
      service_code: r.service_code,
      technical_description: r.technical_description,
      data_type: r.data_type ?? '',
      is_required: r.is_required ? 'Có' : 'Không',
      example_value: r.example_value,
      systems_out: (systems.get(Number(r.physical_id)) ?? []).map((s) => s.code).join(', '),
    }));
  }
}
