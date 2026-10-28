import { Injectable } from '@nestjs/common';
import * as dayjs from 'dayjs';
import { Response } from 'express';
import { DATA_HUB_API_BASE_URL_HOSTS, DataHubApiBaseUrl } from '@modules/databases/data-hub-enums';
import * as ExcelJS from 'exceljs';
import { ExcelColumn } from '@common/utils/export-excel.helper';
import { DataHubDataServiceListQueryService } from './data-hub-data-service-list-query.service';
import { ExportDataServiceQueryDto } from './dto';

export const EXPORT_ROW_CAP = 5000;
const EXPORT_SHEET_NAME = 'data-services';

export const EXPORT_COLUMNS: ExcelColumn[] = [
  { header: 'STT', key: 'stt', width: 8 },
  { header: 'Mã DV', key: 'service_code', width: 22 },
  { header: 'Tên', key: 'name', width: 40 },
  { header: 'Mô hình', key: 'service_type', width: 10 },
  { header: 'Phương thức/Chiều', key: 'method_or_direction', width: 18 },
  { header: 'Endpoint/Host', key: 'endpoint_or_host', width: 50 },
  { header: 'Khối', key: 'division', width: 20 },
  { header: 'Phòng ban', key: 'department', width: 20 },
  { header: 'Đơn vị yêu cầu', key: 'request_unit', width: 24 },
  { header: 'Tần suất', key: 'frequency', width: 18 },
  { header: 'Định dạng tệp', key: 'file_format', width: 14 },
  { header: 'App thụ hưởng', key: 'consumers', width: 32 },
  { header: 'Trạng thái', key: 'status', width: 16 },
  { header: 'Phiên bản', key: 'version_no', width: 10 },
  { header: 'Ngày cập nhật', key: 'updated_at', width: 18 },
];

// Cells starting with = + - @ would be run as formulas by Excel; prefix them so user text stays text.
export const safeCell = (value: string | null): string => {
  if (value === null) return '';
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
};

@Injectable()
export class DataHubDataServiceExportService {
  constructor(private readonly listQuery: DataHubDataServiceListQueryService) {}

  async buildRows(q: ExportDataServiceQueryDto): Promise<Array<Record<string, string | number>>> {
    const rows = await this.listQuery.fetchRows(q, EXPORT_ROW_CAP, 0);
    const [consumers] = await this.listQuery.loadPageRelations(
      rows.map((r) => r.version_id),
      { withTermCounts: false },
    );
    return rows.map((r, i) => {
      const isApi = r.service_type === 'API';
      const host = r.base_url ? (DATA_HUB_API_BASE_URL_HOSTS[r.base_url as DataHubApiBaseUrl] ?? r.base_url) : '';
      return {
        stt: i + 1,
        service_code: safeCell(r.service_code),
        name: safeCell(r.name),
        service_type: r.service_type,
        method_or_direction: r.method ?? r.flow_direction ?? '',
        endpoint_or_host: safeCell(isApi ? `${host}${r.endpoint_path ?? ''}` : r.sftp_host),
        division: safeCell(r.division_name),
        department: safeCell(r.department_name),
        request_unit: safeCell(r.request_unit_name),
        frequency: r.update_frequency ?? r.export_frequency ?? '',
        file_format: r.file_format ?? '',
        consumers: (consumers.get(Number(r.version_id)) ?? []).map((c) => c.code).join(', '),
        status: r.status === 'active' ? 'Hoạt động' : 'Ngừng hoạt động',
        version_no: Number(r.version_no),
        updated_at: dayjs(r.updated_at).format('DD/MM/YYYY HH:mm'),
      };
    });
  }

  // Streams the workbook itself instead of using exportExcelToResponse: that helper default-imports dayjs, which
  // is undefined without esModuleInterop and throws before anything is written.
  async export(q: ExportDataServiceQueryDto, res: Response): Promise<void> {
    const rows = await this.buildRows(q);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(EXPORT_SHEET_NAME);
    sheet.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }));
    sheet.getRow(1).font = { bold: true };
    rows.forEach((row) => sheet.addRow(row));

    const fileName = `${EXPORT_SHEET_NAME}_${dayjs().format('DD-MM-YYYY_HHmm')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  }
}
