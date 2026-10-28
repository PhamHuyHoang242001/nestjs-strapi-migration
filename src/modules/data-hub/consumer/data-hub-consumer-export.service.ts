import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { exportExcelToResponse } from '@common/utils/export-excel.helper';
import { DataHubUserRefService } from '../common/data-hub-user-ref.service';
import { sqlRows } from './consumer-sql.util';
import { loadBusinessContactUserIds } from './consumer-business-contacts.util';
import { ConsumerListFilter, buildConsumerWhere } from './consumer-list-filter.util';
import { DataHubConsumerCountsService } from './data-hub-consumer-counts.service';
import { CONSUMER_ITEM_COLUMNS, CONSUMER_ITEM_JOINS, ConsumerListRow } from './consumer-item-sql.util';

const EXPORT_ROW_CAP = 5000;

type ExportRow = ConsumerListRow;

const COLUMNS = [
  { header: 'STT', key: 'stt', width: 8 },
  { header: 'Mã', key: 'code', width: 22 },
  { header: 'Tên', key: 'name', width: 32 },
  { header: 'Phân loại', key: 'category', width: 22 },
  { header: 'Khối', key: 'division', width: 24 },
  { header: 'Phòng ban', key: 'department', width: 24 },
  { header: 'Số API', key: 'api_count', width: 10 },
  { header: 'Số SFTP', key: 'sftp_count', width: 10 },
  { header: 'Đầu mối liên hệ nghiệp vụ', key: 'business_contacts', width: 30 },
  { header: 'Mô tả', key: 'description', width: 50 },
  { header: 'Trạng thái', key: 'status', width: 14 },
];

@Injectable()
export class DataHubConsumerExportService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly counts: DataHubConsumerCountsService,
    private readonly userRefs: DataHubUserRefService,
  ) {}

  // Same filters as the list, no paging; capped so one request cannot dump the whole table.
  async buildRows(filter: ConsumerListFilter): Promise<Array<Record<string, unknown>>> {
    const { where, params } = buildConsumerWhere(filter);
    const rows = await sqlRows<ExportRow>(
      this.dataSource,
      `SELECT ${CONSUMER_ITEM_COLUMNS}
       FROM data_hub_consumers c ${CONSUMER_ITEM_JOINS}
       WHERE ${where}
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT $${params.length + 1}`,
      [...params, EXPORT_ROW_CAP],
    );
    const ids = rows.map((r) => Number(r.id));
    const [counts, contactIds] = await Promise.all([
      this.counts.loadServiceCounts(ids),
      loadBusinessContactUserIds(this.dataSource, ids),
    ]);
    const users = await this.userRefs.resolve([...contactIds.values()].flat());
    const emails = (id: number): string =>
      this.userRefs
        .toRefs(users, contactIds.get(id) ?? [])
        .map((u) => u.email ?? String(u.id))
        .join(', ');
    return rows.map((r, i) => ({
      stt: i + 1,
      code: r.code,
      name: r.name,
      category: r.category,
      division: r.division_name ?? '',
      department: r.department_name ?? '',
      api_count: counts.get(Number(r.id))?.api ?? 0,
      sftp_count: counts.get(Number(r.id))?.sftp ?? 0,
      business_contacts: emails(Number(r.id)),
      description: r.short_description,
      status: r.status,
    }));
  }

  async export(filter: ConsumerListFilter, res: Response): Promise<void> {
    const rows = await this.buildRows(filter);
    await exportExcelToResponse(res, { sheetName: 'consumers', columns: COLUMNS, rows });
  }
}
