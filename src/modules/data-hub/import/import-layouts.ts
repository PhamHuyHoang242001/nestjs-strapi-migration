// Sheet layouts of the five imports (one data sheet each). A column added here appears in the downloaded template
// and is read back from the upload in the same position.
import {
  DataHubApiAuthType,
  DataHubApiBaseUrl,
  DataHubApiMethod,
  DataHubApiSyncMode,
  DataHubApiUpdateFrequency,
  DataHubConsumerCategory,
  DataHubServiceType,
  DataHubSftpEncryption,
  DataHubSftpExportFrequency,
  DataHubSftpFileFormat,
  DataHubSftpFlowDirection,
} from '@modules/databases/data-hub-enums';
import { col, ImportColumn, ImportLayout } from './import-workbook.util';

export const CONSUMER_IMPORT_MAX_ROWS = 500;

export const CONSUMER_COLUMNS: ImportColumn[] = [
  col(
    'code',
    'Mã app',
    'r',
    24,
    'Chữ in hoa, số, dấu _ (2-100 ký tự); hệ thống tự viết hoa. Chưa có trong hệ thống và không lặp trong file.',
  ),
  col('name', 'Tên app', 'r', 32, 'Tối đa 255 ký tự.'),
  col('category', 'Phân loại', 'r', 20, 'INTERNAL_APP hoặc PARTNER_ECOSYSTEM.', Object.values(DataHubConsumerCategory)),
  col('division', 'Mã khối chủ quản', 'r', 18, 'Mã khối chủ quản đã có trong hệ thống (gõ tay).'),
  col('short_description', 'Mô tả ngắn', 'r', 44, 'Tối đa 200 ký tự.'),
  col('so_apps', 'SO APP', 'r', 36, '1-20 email người dùng đang hoạt động, ngăn cách bằng dấu ;'),
];

export const CONSUMER_IMPORT_LAYOUT: ImportLayout = {
  sheets: [{ key: 'CONSUMERS', name: 'APP_THU_HUONG', columns: CONSUMER_COLUMNS, maxRows: CONSUMER_IMPORT_MAX_ROWS }],
  primarySheets: ['CONSUMERS'],
  maxPrimaryRows: CONSUMER_IMPORT_MAX_ROWS,
  emptyMessage: 'chưa có app thụ hưởng nào',
  tooManyMessage: 'quá nhiều app thụ hưởng mỗi file',
  resultFilePrefix: 'ket-qua-import-app-thu-huong',
};

export const LOGICAL_TERM_IMPORT_MAX_ROWS = 1000;

export const LOGICAL_TERM_COLUMNS: ImportColumn[] = [
  col(
    'code',
    'Mã thuật ngữ',
    'r',
    30,
    'Tối đa 255 ký tự; chưa có trong hệ thống (không phân biệt hoa thường) và không lặp trong file.',
  ),
  col('short_description', 'Mô tả ngắn', 'r', 50, 'Tối đa 400 ký tự.'),
  col('example_value', 'Ví dụ', 'o', 30, 'Tối đa 1000 ký tự.'),
];

export const LOGICAL_TERM_IMPORT_LAYOUT: ImportLayout = {
  sheets: [
    {
      key: 'TERMS',
      name: 'THUAT_NGU_CHUAN_HOA',
      columns: LOGICAL_TERM_COLUMNS,
      maxRows: LOGICAL_TERM_IMPORT_MAX_ROWS,
    },
  ],
  primarySheets: ['TERMS'],
  maxPrimaryRows: LOGICAL_TERM_IMPORT_MAX_ROWS,
  emptyMessage: 'chưa có thuật ngữ nào',
  tooManyMessage: 'quá nhiều thuật ngữ mỗi file',
  resultFilePrefix: 'ket-qua-import-thuat-ngu-chuan-hoa',
};

export const SERVICE_IMPORT_MAX_ROWS = 200;
export const SERVICES_SHEET = 'SERVICES';

const values = (e: Record<string, string>): string[] => Object.values(e);

// Columns A..J, shared by the API and SFTP sheets. Source tables and physical terms are added afterwards by the
// source table import.
const SERVICE_COMMON: ImportColumn[] = [
  col('name', 'Tên dịch vụ', 'r', 36, 'Tối đa 90 ký tự.'),
  col('short_description', 'Mô tả ngắn', 'r', 44, 'Tối đa 400 ký tự.'),
  col('purpose', 'Mục đích sử dụng', 'o', 36, 'Tối đa 1000 ký tự.'),
  col('request_unit', 'Đơn vị yêu cầu', 'r', 18, 'Mã đơn vị yêu cầu đã có trong hệ thống (gõ tay).'),
  col('division', 'Khối chủ quản', 'r', 16, 'Mã khối đã có trong hệ thống (gõ tay). Dùng để sinh mã dịch vụ.'),
  col(
    'department',
    'Đơn vị quản lý',
    'r',
    16,
    'Mã đơn vị (phòng) sở hữu dịch vụ, đã có trong hệ thống (gõ tay). Người import phải là thành viên đơn vị này.',
  ),
  col(
    'consumers',
    'Mã app thụ hưởng',
    'o',
    28,
    '0-20 mã app đang hoạt động đã có trong hệ thống (tạo ở import App thụ hưởng), ngăn cách bằng dấu ; (vd APP_CRM; APP_LOS). Để trống = dịch vụ chưa có app.',
  ),
  col('requesters', 'Người yêu cầu', 'r', 34, '1-50 email người dùng, ngăn cách bằng dấu ;'),
  col('it_supporters', 'IT hỗ trợ', 'r', 34, '1-50 email người dùng, ngăn cách bằng dấu ;'),
  col('service_owners', 'SO dịch vụ', 'r', 34, '1-50 email người dùng, ngăn cách bằng dấu ;'),
];

export const API_COLUMNS: ImportColumn[] = [
  ...SERVICE_COMMON,
  col('method', 'Method', 'r', 12, 'HTTP method.', values(DataHubApiMethod)),
  col('base_url', 'Base URL', 'r', 14, 'Mã base URL (không nhập host).', values(DataHubApiBaseUrl)),
  col('endpoint_path', 'Endpoint path', 'r', 36, 'Đường dẫn sau base URL, tối đa 1000 ký tự. Vd /v1/customers/{cif}.'),
  col('auth_type', 'Auth type', 'r', 22, 'Cách xác thực khi gọi API.', values(DataHubApiAuthType)),
  col('peak_tps', 'Peak TPS', 'o', 12, 'Số hoặc chữ, tối đa 255 ký tự.'),
  col('update_frequency', 'Tần suất cập nhật', 'r', 18, 'Độ mới của dữ liệu.', values(DataHubApiUpdateFrequency)),
  col('sync_mode', 'Chế độ đồng bộ', 'r', 16, 'Kiểu gọi.', values(DataHubApiSyncMode)),
  col('timeout', 'Timeout', 'c', 12, 'Bắt buộc khi Chế độ đồng bộ = SYNC. Số hoặc chữ, tối đa 100 ký tự.'),
  col('sample_request', 'Sample request (JSON)', 'o', 36, 'Dán nguyên JSON hợp lệ vào một ô.'),
  col('sample_response', 'Sample response (JSON)', 'o', 36, 'Dán nguyên JSON hợp lệ vào một ô.'),
];

export const SFTP_COLUMNS: ImportColumn[] = [
  ...SERVICE_COMMON,
  col('folder_path', 'Thư mục', 'o', 24, 'Tối đa 1000 ký tự.'),
  col('file_name_pattern', 'Mẫu tên file', 'o', 26, 'Tối đa 500 ký tự. Vd CARD_TXN_{yyyyMMdd}.csv.'),
  col('file_format', 'Định dạng file', 'r', 14, 'Định dạng file.', values(DataHubSftpFileFormat)),
  col('export_frequency', 'Tần suất xuất', 'r', 16, 'Tần suất xuất file.', values(DataHubSftpExportFrequency)),
  col('max_file_size', 'Dung lượng tối đa', 'o', 16, 'Số hoặc chữ, tối đa 255 ký tự. Vd 2GB.'),
  col('encryption', 'Mã hoá', 'r', 12, 'Mã hoá file.', values(DataHubSftpEncryption)),
  col('flow_direction', 'Chiều luồng', 'o', 12, 'Chiều luồng dữ liệu.', values(DataHubSftpFlowDirection)),
];

export type ServiceImportKind = 'API' | 'SFTP';

const layout = (kind: ServiceImportKind): ImportLayout => ({
  sheets: [
    {
      key: SERVICES_SHEET,
      name: kind === 'API' ? 'DICH_VU_API' : 'DICH_VU_SFTP',
      columns: kind === 'API' ? API_COLUMNS : SFTP_COLUMNS,
      maxRows: SERVICE_IMPORT_MAX_ROWS,
    },
  ],
  primarySheets: [SERVICES_SHEET],
  maxPrimaryRows: SERVICE_IMPORT_MAX_ROWS,
  emptyMessage: 'chưa có dịch vụ nào',
  tooManyMessage: 'quá nhiều dịch vụ mỗi file',
  resultFilePrefix: kind === 'API' ? 'ket-qua-import-dich-vu-api' : 'ket-qua-import-dich-vu-sftp',
});

export const SERVICE_IMPORT_LAYOUTS: Record<ServiceImportKind, ImportLayout> = {
  API: layout('API'),
  SFTP: layout('SFTP'),
};

export const SERVICE_TYPE_OF: Record<ServiceImportKind, DataHubServiceType> = {
  API: DataHubServiceType.API,
  SFTP: DataHubServiceType.SFTP,
};

export const SOURCE_TABLE_IMPORT_MAX_ROWS = 5000;
export const TERMS_SHEET = 'TERMS';
// Same caps as the data service form.
export const MAX_TABLES_PER_SERVICE = 50;
export const MAX_TERMS_PER_TABLE = 500;

export const SOURCE_TABLE_COLUMNS: ImportColumn[] = [
  col(
    'service_code',
    'Mã dịch vụ',
    'r',
    26,
    'Mã dịch vụ đã có trong hệ thống (vd API_EDA_BI_12), do import Dịch vụ API / SFTP sinh.',
  ),
  col(
    'table_name',
    'Tên bảng nguồn',
    'r',
    30,
    'Tối đa 255 ký tự. Bảng mới: tên không được trùng bảng nào trong hệ thống. Nếu tên là bảng dịch vụ này đã dùng thì thêm term vào bảng đó. Các dòng cùng dịch vụ + cùng tên bảng gom thành 1 bảng.',
  ),
  col('table_description', 'Mô tả bảng', 'o', 30, 'Tối đa 2000 ký tự. Lấy ở dòng đầu tiên của bảng mới.'),
  col(
    'code',
    'Mã thuật ngữ nghiệp vụ',
    'r',
    26,
    'Tên cột vật lý, tối đa 255 ký tự, không trùng trong cùng bảng (không phân biệt hoa thường).',
  ),
  col('technical_description', 'Mô tả kỹ thuật', 'r', 36, 'Tối đa 2000 ký tự.'),
  col('data_type', 'Kiểu dữ liệu', 'r', 18, 'Tối đa 100 ký tự. Vd VARCHAR(20), NUMBER(18,2), DATE.'),
  col('is_required', 'Bắt buộc', 'o', 10, 'Có hoặc Không. Để trống = Không.', ['Có', 'Không']),
  col('example_value', 'Ví dụ', 'o', 22, 'Tối đa 1000 ký tự.'),
  col(
    'logical_code',
    'Mã thuật ngữ chuẩn hoá',
    'o',
    26,
    'Để trống = không map. Mã thuật ngữ chuẩn hoá đã có trong hệ thống (tạo ở import Thuật ngữ chuẩn hoá).',
  ),
];

export const SOURCE_TABLE_IMPORT_LAYOUT: ImportLayout = {
  sheets: [
    {
      key: TERMS_SHEET,
      name: 'BANG_NGUON_THUAT_NGU',
      columns: SOURCE_TABLE_COLUMNS,
      maxRows: SOURCE_TABLE_IMPORT_MAX_ROWS,
      templateRows: SOURCE_TABLE_IMPORT_MAX_ROWS,
    },
  ],
  primarySheets: [TERMS_SHEET],
  maxPrimaryRows: SOURCE_TABLE_IMPORT_MAX_ROWS,
  emptyMessage: 'chưa có dòng nào',
  tooManyMessage: 'quá nhiều dòng mỗi file',
  resultFilePrefix: 'ket-qua-import-bang-nguon-thuat-ngu',
};

// Accepted spellings of the Bắt buộc cell.
export const YES_VALUES = new Set(['có', 'co', 'x', 'true', '1', 'yes', 'y']);
export const NO_VALUES = new Set(['không', 'khong', 'false', '0', 'no', 'n']);
