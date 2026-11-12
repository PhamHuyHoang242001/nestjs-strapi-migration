// Sheet layouts of the five imports (one data sheet each). Row 1 holds exactly these column names in this order
// (the agreed import templates); a column added here appears in the downloaded template and is read back from the
// upload in the same position. Required levels follow the create APIs.
import {
  DataHubApiAuthType,
  DataHubApiMethod,
  DataHubApiSyncMode,
  DataHubApiUpdateFrequency,
  DataHubConsumerCategory,
  DataHubServiceType,
  DataHubEncryption,
  DataHubSftpExportFrequency,
  DataHubSftpFileFormat,
  DataHubSftpFlowDirection,
} from '@modules/databases/data-hub-enums';
import { col, ImportColumn, ImportLayout, sttCol } from './import-workbook.util';

export const CONSUMER_IMPORT_MAX_ROWS = 500;

export const CONSUMER_COLUMNS: ImportColumn[] = [
  sttCol(),
  col(
    'code',
    'Mã định danh App',
    'r',
    24,
    'Chữ in hoa, số, dấu _ (2-100 ký tự); hệ thống tự viết hoa. Chưa có trong hệ thống → tạo mới; đã có → cập nhật app đó theo dòng này. Không lặp trong file.',
  ),
  col('name', 'Tên App thụ hưởng', 'r', 32, 'Tối đa 255 ký tự.'),
  col('system', 'Hệ thống', 'r', 30, 'Tên hệ thống đã có trong hệ thống (gõ tay, không phân biệt hoa thường).'),
  col(
    'system_service',
    'Dịch vụ hệ thống',
    'o',
    30,
    'Tên dịch vụ hệ thống, nhập tự do (tối đa 255 ký tự). Để trống = app không gắn dịch vụ.',
  ),
  col('category', 'Phân loại', 'r', 20, 'INTERNAL_APP hoặc PARTNER_ECOSYSTEM.', Object.values(DataHubConsumerCategory)),
  col(
    'owner_unit',
    'Đơn vị chủ quản',
    'r',
    30,
    'Tên đơn vị chủ quản đã có trong hệ thống (gõ tay, không phân biệt hoa thường).',
  ),
  col('so_apps', 'SO App', 'r', 36, '1-20 email người dùng đang hoạt động, ngăn cách bằng dấu ;'),
  col('short_description', 'Mô tả ngắn (VI)', 'r', 44, 'Tối đa 1000 ký tự.'),
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
  sttCol(),
  col(
    'code',
    'Thuật ngữ Chuẩn hoá (Logical Term)',
    'r',
    34,
    'Mã thuật ngữ, tối đa 255 ký tự. Chưa có trong hệ thống (không phân biệt hoa thường) → tạo mới; đã có → cập nhật mô tả, ví dụ. Không lặp trong file.',
  ),
  col('short_description', 'Mô tả', 'r', 50, 'Tối đa 400 ký tự.'),
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

// Columns of the API and SFTP sheets, in the agreed order. Source tables and physical terms are added afterwards by
// the source table import.
const SERVICE_CODE = col(
  'service_code',
  'Mã dịch vụ',
  'r',
  26,
  'Chữ in hoa, số, dấu _ hoặc - (2-100 ký tự); hệ thống tự viết hoa. Chưa có trong hệ thống → tạo dịch vụ mới với đúng mã này; đã có → cập nhật dịch vụ đó theo dòng này (bảng nguồn, thuật ngữ giữ nguyên). Không lặp trong file.',
);
const SERVICE_HEAD: ImportColumn[] = [
  col('short_description', 'Mô tả ngắn', 'r', 44, 'Tối đa 400 ký tự.'),
  col('request_unit', 'Đơn vị yêu cầu', 'r', 18, 'Mã đơn vị yêu cầu đã có trong hệ thống (gõ tay).'),
  col(
    'consumers',
    'App thụ hưởng',
    'r',
    28,
    '1-20 mã app đang hoạt động đã có trong hệ thống (tạo ở import App thụ hưởng), ngăn cách bằng dấu ; (vd APP_CRM; APP_LOS).',
  ),
  col('purpose', 'Mục đích sử dụng', 'o', 36, 'Tối đa 1000 ký tự.'),
  col('requesters', 'Đầu mối yêu cầu', 'r', 34, '1-50 email người dùng, ngăn cách bằng dấu ;'),
  col(
    'it_support_email',
    'IT hỗ trợ (email)',
    'c',
    30,
    'Nhiều email cách nhau bởi dấu ;. IT hỗ trợ cần tối thiểu 1 trong 3 cột email / sđt / link.',
  ),
  col('it_support_phone', 'IT hỗ trợ (sđt)', 'c', 22, 'Nhiều số điện thoại cách nhau bởi dấu ;.'),
  col(
    'it_support_link',
    'IT hỗ trợ (link)',
    'c',
    34,
    '1 link nhóm, bắt đầu bằng https://teams.microsoft.com hoặc https://zalo.me.',
  ),
  col('service_ops', 'Ops Dịch vụ', 'o', 36, 'Tối đa 1000 ký tự.'),
];
const SERVICE_TAIL: ImportColumn[] = [
  col(
    'usage_guide_html',
    'Hướng dẫn sử dụng',
    'r',
    40,
    'Bắt buộc, tối đa 500000 ký tự (chữ thường hoặc HTML). Chưa có thì ghi "Bổ sung hướng dẫn sử dụng sau" và cập nhật sau trên màn sửa dịch vụ.',
  ),
  col('division', 'Khối chủ quản', 'r', 16, 'Mã khối đã có trong hệ thống (gõ tay).'),
  col(
    'department',
    'Đơn vị phát hành',
    'r',
    16,
    'Mã đơn vị (phòng) sở hữu dịch vụ, đã có trong hệ thống (gõ tay). Người import phải là thành viên đơn vị này.',
  ),
  col('service_owners', 'SO Dịch vụ', 'r', 34, '1-50 email người dùng, ngăn cách bằng dấu ;'),
];

export const API_COLUMNS: ImportColumn[] = [
  sttCol(),
  SERVICE_CODE,
  col('name', 'Tên dịch vụ API', 'r', 36, 'Tối đa 90 ký tự.'),
  ...SERVICE_HEAD,
  col('method', 'Method', 'r', 12, 'HTTP method.', values(DataHubApiMethod)),
  col(
    'domain',
    'Base-URL',
    'r',
    32,
    'URL domain đang hoạt động trong danh mục domain của hệ thống, vd https://api-int.vpbank.com.vn.',
  ),
  col('endpoint_path', 'Path', 'r', 36, 'Đường dẫn sau Base-URL, tối đa 1000 ký tự. Vd /v1/customers/{cif}.'),
  col('auth_type', 'Cơ chế xác thực', 'r', 22, 'Cách xác thực khi gọi API.', values(DataHubApiAuthType)),
  col('encryption', 'Mã hoá bảo mật', 'r', 14, 'Mã hoá dữ liệu.', values(DataHubEncryption)),
  col('peak_tps', 'Peak TPS', 'o', 12, 'Số hoặc chữ, tối đa 255 ký tự.'),
  col('update_frequency', 'Tần suất', 'r', 18, 'Độ mới của dữ liệu.', values(DataHubApiUpdateFrequency)),
  col('sync_mode', 'Cơ chế xử lý', 'r', 16, 'Kiểu gọi.', values(DataHubApiSyncMode)),
  col('timeout', 'Thời gian timeout', 'c', 14, 'Bắt buộc khi Cơ chế xử lý = SYNC. Số hoặc chữ, tối đa 100 ký tự.'),
  col('sample_request', 'Sample Request Body', 'o', 36, 'Dán nguyên JSON hợp lệ vào một ô.'),
  col('sample_response', 'Sample Response Payload', 'o', 36, 'Dán nguyên JSON hợp lệ vào một ô.'),
  ...SERVICE_TAIL,
];

export const SFTP_COLUMNS: ImportColumn[] = [
  sttCol(),
  SERVICE_CODE,
  col('name', 'Tên dịch vụ SFTP', 'r', 36, 'Tối đa 90 ký tự.'),
  ...SERVICE_HEAD,
  col('folder_path', 'Thư mục trên SFTP Server', 'o', 26, 'Tối đa 1000 ký tự.'),
  col('file_name_pattern', 'Tên file quy ước', 'o', 26, 'Tối đa 500 ký tự. Vd CARD_TXN_{yyyyMMdd}.csv.'),
  col('flow_direction', 'Chiều truyền', 'o', 12, 'Chiều luồng dữ liệu.', values(DataHubSftpFlowDirection)),
  col('encryption', 'Mã hoá bảo mật', 'r', 14, 'Mã hoá file.', values(DataHubEncryption)),
  col('file_format', 'Định dạng file', 'r', 14, 'Định dạng file.', values(DataHubSftpFileFormat)),
  col('export_frequency', 'Tần suất', 'r', 16, 'Tần suất xuất file.', values(DataHubSftpExportFrequency)),
  col('max_file_size', 'Giới hạn dung lượng / file', 'o', 18, 'Số hoặc chữ, tối đa 255 ký tự. Vd 2GB.'),
  ...SERVICE_TAIL,
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
  col('service_code', 'Mã dịch vụ', 'r', 26, 'Mã dịch vụ đã có trong hệ thống (vd API_EDA_BI_12).'),
  col(
    'table_name',
    'Bảng nguồn dịch vụ (Full path)',
    'r',
    32,
    'Tối đa 255 ký tự. Bảng mới: tên không được trùng bảng nào trong hệ thống. Nếu tên là bảng dịch vụ này đã dùng thì thêm term vào bảng đó. Các dòng cùng dịch vụ + cùng tên bảng gom thành 1 bảng.',
  ),
  col(
    'table_description',
    'Cơ chế bảng (Cơ chế đồng bộ/cập nhật)',
    'o',
    32,
    'Tối đa 2000 ký tự. Lấy ở dòng đầu tiên của bảng mới.',
  ),
  col(
    'logical_code',
    'Thuật ngữ Chuẩn hoá (Logical Term)',
    'o',
    30,
    'Để trống = không map. Mã thuật ngữ chuẩn hoá đã có trong hệ thống (tạo ở import Thuật ngữ chuẩn hoá).',
  ),
  col(
    'code',
    'Thuật ngữ Nghiệp vụ (Physical Term)',
    'r',
    30,
    'Tên cột vật lý, tối đa 255 ký tự, không trùng trong cùng bảng (không phân biệt hoa thường).',
  ),
  col('technical_description', 'Mô tả', 'r', 36, 'Tối đa 2000 ký tự.'),
  col('data_type', 'Kiểu dữ liệu', 'r', 18, 'Tối đa 100 ký tự. Vd VARCHAR(20), NUMBER(18,2), DATE.'),
  col('is_required', 'Bắt buộc', 'o', 10, 'Có hoặc Không. Để trống = Không.', ['Có', 'Không']),
  col('example_value', 'Ví dụ', 'o', 22, 'Tối đa 1000 ký tự.'),
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
