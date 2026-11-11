import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { exportExcelSheetsToResponse, safeExcelText } from '@common/utils/export-excel.helper';
import { DataHubServiceType } from '@modules/databases/data-hub-enums';
import { SERVICE_IMPORT_LAYOUTS } from '../import/import-layouts';
import { layoutSheet } from '../import/layout-export.util';
import { DataHubDataServiceListQueryService } from './data-hub-data-service-list-query.service';
import { loadServiceExportRows } from './data-service-export-rows.util';
import { ExportDataServiceQueryDto } from './dto';

export const EXPORT_ROW_CAP = 5000;

// Cells starting with = + - @ (or tab / CR) would be run as formulas by Excel; prefix them so user text stays text.
export const safeCell = (value: string | null): string => safeExcelText(value ?? '');

type Kind = 'API' | 'SFTP';
const KINDS: Kind[] = ['API', 'SFTP'];

// Export of data services in the import templates' columns, so a file can be edited and imported back: sheet
// DICH_VU_API and / or DICH_VU_SFTP (the `service_type` filter picks one; none = both sheets). Same filters as the
// list (or the chosen `ids`), no paging, at most EXPORT_ROW_CAP services.
@Injectable()
export class DataHubDataServiceExportService {
  constructor(
    private readonly listQuery: DataHubDataServiceListQueryService,
    private readonly dataSource: DataSource,
  ) {}

  private services(q: ExportDataServiceQueryDto, inactiveDepartmentIds: number[] | null) {
    return this.listQuery.fetchRows(q, inactiveDepartmentIds, EXPORT_ROW_CAP, 0);
  }

  // Template rows per service type, in list order.
  async buildRows(
    q: ExportDataServiceQueryDto,
    inactiveDepartmentIds: number[] | null,
  ): Promise<Record<Kind, Array<Record<string, string>>>> {
    const services = await this.services(q, inactiveDepartmentIds);
    const details = await loadServiceExportRows(
      this.dataSource,
      services.map((s) => Number(s.version_id)),
    );
    const out: Record<Kind, Array<Record<string, string>>> = { API: [], SFTP: [] };
    for (const s of services) {
      const row = details.get(Number(s.version_id));
      const kind = s.service_type as Kind;
      if (row && out[kind]) out[kind].push({ service_code: s.service_code, ...row });
    }
    return out;
  }

  async export(q: ExportDataServiceQueryDto, inactiveDepartmentIds: number[] | null, res: Response): Promise<void> {
    const rows = await this.buildRows(q, inactiveDepartmentIds);
    const kinds = q.service_type ? [q.service_type as Kind] : KINDS;
    const base =
      q.service_type === DataHubServiceType.SFTP ? 'dich-vu-sftp' : q.service_type ? 'dich-vu-api' : 'dich-vu';
    await exportExcelSheetsToResponse(
      res,
      base,
      kinds.map((k) => layoutSheet(SERVICE_IMPORT_LAYOUTS[k], rows[k])),
    );
  }
}
