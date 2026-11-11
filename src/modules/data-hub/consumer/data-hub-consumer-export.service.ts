import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { exportExcelSheetsToResponse } from '@common/utils/export-excel.helper';
import { DataHubUserRefService } from '../common/data-hub-user-ref.service';
import { CONSUMER_IMPORT_LAYOUT } from '../import/import-layouts';
import { layoutSheet, listCell } from '../import/layout-export.util';
import { sqlRows } from './consumer-sql.util';
import { loadSoAppUserIds } from './consumer-so-apps.util';
import { ConsumerListFilter, buildConsumerWhere } from './consumer-list-filter.util';
import { CONSUMER_ITEM_COLUMNS, CONSUMER_ITEM_JOINS, ConsumerListRow } from './consumer-item-sql.util';

const EXPORT_ROW_CAP = 5000;

// Export of App thụ hưởng in the import template's columns (STT, Mã định danh App, Tên App thụ hưởng, Hệ thống,
// Dịch vụ hệ thống, Phân loại, Đơn vị chủ quản, SO App, Mô tả ngắn (VI)); the file can be imported back.
@Injectable()
export class DataHubConsumerExportService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly userRefs: DataHubUserRefService,
  ) {}

  // Same filters as the list, no paging; capped so one request cannot dump the whole table.
  async buildRows(filter: ConsumerListFilter): Promise<Array<Record<string, unknown>>> {
    const { where, params } = buildConsumerWhere(filter);
    const rows = await sqlRows<ConsumerListRow>(
      this.dataSource,
      `SELECT ${CONSUMER_ITEM_COLUMNS}
       FROM data_hub_consumers c ${CONSUMER_ITEM_JOINS}
       WHERE ${where}
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT $${params.length + 1}`,
      [...params, EXPORT_ROW_CAP],
    );
    const soAppIds = await loadSoAppUserIds(
      this.dataSource,
      rows.map((r) => Number(r.id)),
    );
    const users = await this.userRefs.resolve([...soAppIds.values()].flat());
    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      system: r.system_name ?? '',
      system_service: r.system_service ?? '',
      category: r.category,
      owner_unit: r.owner_unit_name ?? '',
      so_apps: listCell(this.userRefs.toRefs(users, soAppIds.get(Number(r.id)) ?? []).map((u) => u.email)),
      short_description: r.short_description,
    }));
  }

  async export(filter: ConsumerListFilter, res: Response): Promise<void> {
    const rows = await this.buildRows(filter);
    await exportExcelSheetsToResponse(res, 'app-thu-huong', [layoutSheet(CONSUMER_IMPORT_LAYOUT, rows)]);
  }
}
