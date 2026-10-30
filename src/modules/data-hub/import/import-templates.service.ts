import { Injectable } from '@nestjs/common';
import { DataHubConsumerCategory } from '@modules/databases/data-hub-enums';
import { DataSource } from 'typeorm';
import { sampleCodes } from './import-helpers.util';
import {
  CONSUMER_IMPORT_LAYOUT,
  LOGICAL_TERM_IMPORT_LAYOUT,
  SERVICE_IMPORT_LAYOUTS,
  ServiceImportKind,
  SOURCE_TABLE_IMPORT_LAYOUT,
} from './import-layouts';
import { buildImportTemplate, exampleTag, writeExampleRows } from './import-workbook.util';

@Injectable()
export class ConsumerImportTemplateService {
  constructor(private readonly dataSource: DataSource) {}

  async build(example?: { email: string }): Promise<Buffer> {
    const [division = ''] = example ? await sampleCodes(this.dataSource, 'data_hub_divisions') : [];
    return buildImportTemplate({
      layout: CONSUMER_IMPORT_LAYOUT,
      fillExample: example
        ? (workbook) => {
            // Unique per download so the sample imports as-is, more than once.
            const tag = exampleTag();
            writeExampleRows(workbook, CONSUMER_IMPORT_LAYOUT.sheets[0], [
              {
                code: `APP_DEMO_CRM_${tag}`,
                name: `CRM nội bộ ${tag}`,
                category: DataHubConsumerCategory.INTERNAL_APP,
                division,
                short_description: 'Ứng dụng CRM phục vụ chăm sóc khách hàng',
                so_apps: example.email,
              },
              {
                code: `APP_DEMO_PARTNER_${tag}`,
                name: `Cổng đối tác ${tag}`,
                category: DataHubConsumerCategory.PARTNER_ECOSYSTEM,
                division,
                short_description: 'Cổng kết nối đối tác bên ngoài',
                so_apps: example.email,
              },
            ]);
          }
        : undefined,
    });
  }
}

@Injectable()
export class LogicalTermImportTemplateService {
  build(example: boolean): Promise<Buffer> {
    return buildImportTemplate({
      layout: LOGICAL_TERM_IMPORT_LAYOUT,
      fillExample: example
        ? (workbook) => {
            const tag = exampleTag();
            writeExampleRows(workbook, LOGICAL_TERM_IMPORT_LAYOUT.sheets[0], [
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
        : undefined,
    });
  }
}

const API_ROWS = (tag: string): Array<Record<string, string>> => [
  {
    name: `Tra cứu hồ sơ khách hàng 360 ${tag}`,
    short_description: 'Trả thông tin định danh và liên hệ của khách hàng theo CIF',
    purpose: 'Phục vụ app CRM hiển thị hồ sơ khách hàng',
    method: 'GET',
    base_url: 'API_INT',
    endpoint_path: '/v1/customers/{cif}/profile',
    auth_type: 'BEARER_TOKEN',
    peak_tps: '200',
    update_frequency: 'REALTIME',
    sync_mode: 'SYNC',
    timeout: '3000',
    sample_request: '{"cif":"10012345"}',
    sample_response: '{"cif":"10012345","full_name":"Nguyễn Văn A","dob":"1990-05-12"}',
  },
  {
    name: `Lịch sử khoản vay ${tag}`,
    short_description: 'Danh sách khoản vay đã giải ngân của khách hàng',
    method: 'POST',
    base_url: 'API_INT',
    endpoint_path: '/v1/loans/history',
    auth_type: 'X_IBM_CLIENT_ID',
    peak_tps: '50',
    update_frequency: 'DAILY_D1',
    sync_mode: 'ASYNC',
  },
];

const SFTP_ROWS = (tag: string): Array<Record<string, string>> => [
  {
    name: `Xuất giao dịch thẻ hằng ngày ${tag}`,
    short_description: 'File giao dịch thẻ tín dụng phát sinh trong ngày D-1',
    purpose: 'Đối soát với đối tác',
    folder_path: '/outbound/card/',
    file_name_pattern: 'CARD_TXN_{yyyyMMdd}.csv',
    file_format: 'CSV_PIPE',
    export_frequency: 'DAILY_0200',
    max_file_size: '2GB',
    encryption: 'PGP_KEY',
    flow_direction: 'PUSH',
  },
];

// Builds the API / SFTP service import template. The sample uses real org codes, the newest active apps (so it
// links what the App thụ hưởng import just created) and the caller's email, and imports as-is.
@Injectable()
export class DataServiceImportTemplateService {
  constructor(private readonly dataSource: DataSource) {}

  async build(kind: ServiceImportKind, example?: { email: string }): Promise<Buffer> {
    const layout = SERVICE_IMPORT_LAYOUTS[kind];
    if (!example) return buildImportTemplate({ layout });
    const [[requestUnit = ''], [division = ''], [department = ''], consumers] = await Promise.all([
      sampleCodes(this.dataSource, 'data_hub_request_units'),
      sampleCodes(this.dataSource, 'data_hub_divisions'),
      sampleCodes(this.dataSource, 'data_hub_departments'),
      sampleCodes(this.dataSource, 'data_hub_consumers', { limit: 2, newest: true, activeOnly: true }),
    ]);
    const common = {
      request_unit: requestUnit,
      division,
      department,
      consumers: consumers.join('; '),
      requesters: example.email,
      it_supporters: example.email,
      service_owners: example.email,
    };
    const tag = exampleTag();
    const rows = (kind === 'API' ? API_ROWS(tag) : SFTP_ROWS(tag)).map((r) => ({ ...common, ...r }));
    return buildImportTemplate({
      layout,
      fillExample: (workbook) => writeExampleRows(workbook, layout.sheets[0], rows),
    });
  }
}

@Injectable()
export class SourceTableImportTemplateService {
  constructor(private readonly dataSource: DataSource) {}

  // The sample adds one new table with two terms to the newest service, mapped to the newest logical terms, so
  // one taken right after the earlier imports builds on what they created.
  async build(example: boolean): Promise<Buffer> {
    if (!example) return buildImportTemplate({ layout: SOURCE_TABLE_IMPORT_LAYOUT });
    const [[service = ''], logicals] = await Promise.all([
      sampleCodes(this.dataSource, 'data_hub_data_services', { newest: true, column: 'service_code' }),
      sampleCodes(this.dataSource, 'data_hub_logical_terms', { limit: 2, newest: true }),
    ]);
    // Newest first: DATE_OF_BIRTH was created after CUSTOMER_CIF by the logical term example.
    const [dobLogical = '', cifLogical = ''] = logicals;
    const table = `C360_CUSTOMER_PROFILE_${exampleTag()}`;
    return buildImportTemplate({
      layout: SOURCE_TABLE_IMPORT_LAYOUT,
      fillExample: (workbook) =>
        writeExampleRows(workbook, SOURCE_TABLE_IMPORT_LAYOUT.sheets[0], [
          {
            service_code: service,
            table_name: table,
            table_description: 'Hồ sơ khách hàng hợp nhất',
            code: 'CIF_NO',
            technical_description: 'Số CIF của khách hàng',
            data_type: 'VARCHAR(20)',
            is_required: 'Có',
            example_value: '0010012345',
            logical_code: cifLogical,
          },
          {
            service_code: service,
            table_name: table,
            code: 'DOB',
            technical_description: 'Ngày sinh',
            data_type: 'DATE',
            is_required: 'Không',
            example_value: '1990-05-12',
            logical_code: dobLogical,
          },
          {
            service_code: service,
            table_name: table,
            code: 'FULL_NAME',
            technical_description: 'Họ tên đầy đủ',
            data_type: 'NVARCHAR(200)',
            is_required: 'Có',
            example_value: 'Nguyễn Văn A',
          },
        ]),
    });
  }
}
