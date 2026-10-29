import * as ExcelJS from 'exceljs';
import { IMPORT_SHEETS, ImportDataSheet, SHEET_COLUMNS } from './data-service-import-sheet-columns';
import type { ImportList } from './data-service-import-template.service';

// Sample rows for the "template with example" download: real codes from DANH_MUC and the caller's email, and
// table / logical names made unique with a timestamp, so the sample imports as-is.
export function fillExampleRows(workbook: ExcelJS.Workbook, lists: ImportList[], email: string): void {
  const first = (key: ImportList['key']) => lists.find((l) => l.key === key)?.codes[0] ?? '';
  const twoConsumers = (lists.find((l) => l.key === 'consumers')?.codes ?? []).slice(0, 2).join('; ');
  const tag = new Date().toISOString().replace(/\D/g, '').slice(2, 12);
  const common = (ref: string, name: string, desc: string, purpose: string) => ({
    ref,
    name,
    short_description: desc,
    purpose,
    request_unit: first('request_units'),
    division: first('divisions'),
    department: first('departments'),
    consumers: twoConsumers,
    requesters: email,
    it_supporters: email,
    service_owners: email,
  });

  write(workbook, 'API', [
    {
      ...common(
        'API01',
        'Tra cứu hồ sơ khách hàng 360',
        'Trả thông tin định danh và liên hệ của khách hàng theo CIF',
        'Phục vụ app CRM hiển thị hồ sơ khách hàng',
      ),
      method: 'GET',
      base_url: 'API_INT',
      endpoint_path: '/v1/customers/{cif}/profile',
      auth_type: 'BEARER_TOKEN',
      token_endpoint: '/oauth2/token',
      token_auth_method: 'BASIC',
      peak_tps: '200',
      update_frequency: 'REALTIME',
      sync_mode: 'SYNC',
      timeout: '3000',
      sample_request: '{"cif":"10012345"}',
      sample_response: '{"cif":"10012345","full_name":"Nguyễn Văn A","dob":"1990-05-12"}',
    },
    {
      ...common('API02', 'Lịch sử khoản vay', 'Danh sách khoản vay đã giải ngân của khách hàng', ''),
      method: 'POST',
      base_url: 'API_INT',
      endpoint_path: '/v1/loans/history',
      auth_type: 'X_IBM_CLIENT_ID',
      peak_tps: '50',
      update_frequency: 'DAILY_D1',
      sync_mode: 'ASYNC',
    },
  ]);
  write(workbook, 'SFTP', [
    {
      ...common(
        'SF01',
        'Xuất giao dịch thẻ hằng ngày',
        'File giao dịch thẻ tín dụng phát sinh trong ngày D-1',
        'Đối soát với đối tác',
      ),
      host: 'sftp-int.vpbank.local',
      port: '22',
      auth_type: 'SSH_KEY',
      key_vault_method: 'CYBERARK_PAM',
      vault_account: 'svc_card_export',
      folder_path: '/outbound/card/',
      file_name_pattern: 'CARD_TXN_{yyyyMMdd}.csv',
      file_format: 'CSV_PIPE',
      export_frequency: 'DAILY_0200',
      max_file_size: '2GB',
      encryption: 'PGP_KEY',
      flow_direction: 'PUSH',
    },
  ]);
  const t = (
    service_ref: string,
    table: string,
    table_description: string,
    code: string,
    technical_description: string,
    data_type: string,
    is_required: string,
    example_value: string,
    logical_code: string,
  ) => ({
    service_ref,
    table_name: `${table}_${tag}`,
    table_description,
    code,
    technical_description,
    data_type,
    is_required,
    example_value,
    logical_code: logical_code ? `${logical_code}_${tag}` : '',
  });
  write(workbook, 'TERMS', [
    t(
      'API01',
      'C360_CUSTOMER_PROFILE',
      'Hồ sơ khách hàng hợp nhất',
      'CIF_NO',
      'Số CIF của khách hàng',
      'VARCHAR(20)',
      'Có',
      '0010012345',
      'CUSTOMER_CIF',
    ),
    t('API01', 'C360_CUSTOMER_PROFILE', '', 'FULL_NAME', 'Họ tên đầy đủ', 'NVARCHAR(200)', 'Có', 'Nguyễn Văn A', ''),
    t('API01', 'C360_CUSTOMER_PROFILE', '', 'DOB', 'Ngày sinh', 'DATE', 'Không', '1990-05-12', 'DATE_OF_BIRTH'),
    t(
      'API01',
      'C360_CUSTOMER_CONTACT',
      'Thông tin liên hệ',
      'MOBILE_NO',
      'Số điện thoại chính',
      'VARCHAR(15)',
      'Không',
      '0912345678',
      '',
    ),
    t(
      'API02',
      'DPD_LOAN_DISBURSEMENT',
      'Khoản vay đã giải ngân',
      'CIF_NO',
      'Số CIF khách hàng vay',
      'VARCHAR(20)',
      'Có',
      '0010012345',
      'CUSTOMER_CIF',
    ),
    t(
      'API02',
      'DPD_LOAN_DISBURSEMENT',
      '',
      'LOAN_AMT',
      'Số tiền giải ngân (VND)',
      'NUMBER(18,2)',
      'Có',
      '150000000.00',
      '',
    ),
    t(
      'SF01',
      'DPIS_CARD_TXN_DAILY',
      'Giao dịch thẻ ngày D-1',
      'TXN_ID',
      'Mã giao dịch',
      'VARCHAR(30)',
      'Có',
      'TX20261028000123',
      '',
    ),
    t('SF01', 'DPIS_CARD_TXN_DAILY', '', 'TXN_DATE', 'Ngày giao dịch', 'DATE', 'Có', '2026-10-28', ''),
  ]);
  write(workbook, 'LOGICAL', [
    {
      code: `CUSTOMER_CIF_${tag}`,
      short_description: 'Số CIF định danh khách hàng tại ngân hàng',
      example_value: '0010012345',
    },
    {
      code: `DATE_OF_BIRTH_${tag}`,
      short_description: 'Ngày sinh của khách hàng cá nhân theo giấy tờ tuỳ thân',
      example_value: '1990-05-12',
    },
  ]);
}

// Values are written as text, the same way a user types into the text-formatted cells.
function write(workbook: ExcelJS.Workbook, key: ImportDataSheet, rows: Array<Record<string, string>>): void {
  const sheet = workbook.getWorksheet(IMPORT_SHEETS[key]);
  if (!sheet) return;
  rows.forEach((values, i) => {
    SHEET_COLUMNS[key].forEach((c, j) => {
      const v = values[c.key];
      if (v) sheet.getCell(i + 2, j + 1).value = v;
    });
  });
}
