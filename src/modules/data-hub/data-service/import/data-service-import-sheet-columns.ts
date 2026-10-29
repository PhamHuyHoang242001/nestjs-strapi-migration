// Layout of the bulk-import workbook. The template builder and the parser both read these lists, so a column
// added here appears in the downloaded template and is read back from the upload in the same position.

// Sheet names: ASCII, upper case, no spaces, so they survive any Excel locale and are matched exactly.
export const IMPORT_SHEETS = {
  GUIDE: 'HUONG_DAN',
  API: 'DICH_VU_API',
  SFTP: 'DICH_VU_SFTP',
  TERMS: 'BANG_NGUON_PHYSICAL_TERM',
  LOGICAL: 'LOGICAL_TERM_MOI',
  LISTS: 'DANH_MUC',
} as const;

export type ImportDataSheet = 'API' | 'SFTP' | 'TERMS' | 'LOGICAL';

// r = required, c = required depending on another column, o = optional.
export type ImportColumnLevel = 'r' | 'c' | 'o';

// Dropdown sources: one column each on DANH_MUC.
export type ImportListKey =
  | 'request_units'
  | 'divisions'
  | 'departments'
  | 'consumers'
  | 'method'
  | 'base_url'
  | 'api_auth_type'
  | 'token_auth_method'
  | 'update_frequency'
  | 'sync_mode'
  | 'sftp_auth_type'
  | 'key_vault_method'
  | 'file_format'
  | 'export_frequency'
  | 'encryption'
  | 'flow_direction'
  | 'yes_no';

export interface ImportColumn {
  key: string;
  header: string;
  level: ImportColumnLevel;
  width: number;
  note: string;
  list?: ImportListKey;
}

const col = (
  key: string,
  header: string,
  level: ImportColumnLevel,
  width: number,
  note: string,
  list?: ImportListKey,
): ImportColumn => ({ key, header, level, width, note, list });

// Columns A..K, shared by the API and SFTP sheets.
const SERVICE_COMMON: ImportColumn[] = [
  col(
    'ref',
    'Mã tham chiếu',
    'r',
    16,
    'Mã tạm tự đặt (vd API01), duy nhất trong cả file, tối đa 30 ký tự. Sheet BANG_NGUON_PHYSICAL_TERM dùng mã này để trỏ về dịch vụ. Không lưu vào hệ thống.',
  ),
  col('name', 'Tên dịch vụ', 'r', 36, 'Tối đa 90 ký tự.'),
  col('short_description', 'Mô tả ngắn', 'r', 44, 'Tối đa 400 ký tự.'),
  col('purpose', 'Mục đích sử dụng', 'o', 36, 'Tối đa 1000 ký tự.'),
  col('request_unit', 'Đơn vị yêu cầu', 'r', 18, 'Mã đơn vị yêu cầu, chọn trong danh sách.', 'request_units'),
  col('division', 'Khối chủ quản', 'r', 16, 'Mã khối, chọn trong danh sách. Dùng để sinh mã dịch vụ.', 'divisions'),
  col(
    'department',
    'Đơn vị quản lý',
    'r',
    16,
    'Mã đơn vị (phòng) sở hữu dịch vụ, chọn trong danh sách. Người import phải là thành viên đơn vị này.',
    'departments',
  ),
  col('consumers', 'App thụ hưởng', 'r', 28, '1-20 mã app đang hoạt động, ngăn cách bằng dấu ; (vd APP_CRM; APP_LOS).'),
  col('requesters', 'Người yêu cầu', 'r', 34, '1-50 email người dùng, ngăn cách bằng dấu ;'),
  col('it_supporters', 'IT hỗ trợ', 'r', 34, '1-50 email người dùng, ngăn cách bằng dấu ;'),
  col('service_owners', 'SO dịch vụ', 'r', 34, '1-50 email người dùng, ngăn cách bằng dấu ;'),
];

export const API_COLUMNS: ImportColumn[] = [
  ...SERVICE_COMMON,
  col('method', 'Method', 'r', 12, 'HTTP method.', 'method'),
  col('base_url', 'Base URL', 'r', 14, 'Mã base URL (không nhập host).', 'base_url'),
  col('endpoint_path', 'Endpoint path', 'r', 36, 'Đường dẫn sau base URL, tối đa 1000 ký tự. Vd /v1/customers/{cif}.'),
  col('auth_type', 'Auth type', 'r', 22, 'Cách xác thực khi gọi API.', 'api_auth_type'),
  col('token_endpoint', 'Token endpoint', 'o', 26, 'Tối đa 1000 ký tự. Nên điền khi Auth type = BEARER_TOKEN.'),
  col('token_auth_method', 'Token auth method', 'o', 18, 'Cách xác thực khi lấy token.', 'token_auth_method'),
  col('peak_tps', 'Peak TPS', 'o', 12, 'Số hoặc chữ, tối đa 255 ký tự.'),
  col('update_frequency', 'Tần suất cập nhật', 'r', 18, 'Độ mới của dữ liệu.', 'update_frequency'),
  col('sync_mode', 'Chế độ đồng bộ', 'r', 16, 'Kiểu gọi.', 'sync_mode'),
  col('timeout', 'Timeout', 'c', 12, 'Bắt buộc khi Chế độ đồng bộ = SYNC. Số hoặc chữ, tối đa 100 ký tự.'),
  col('sample_request', 'Sample request (JSON)', 'o', 36, 'Dán nguyên JSON hợp lệ vào một ô.'),
  col('sample_response', 'Sample response (JSON)', 'o', 36, 'Dán nguyên JSON hợp lệ vào một ô.'),
];

export const SFTP_COLUMNS: ImportColumn[] = [
  ...SERVICE_COMMON,
  col('host', 'Host', 'o', 24, 'Máy chủ SFTP, tối đa 255 ký tự.'),
  col('port', 'Port', 'o', 8, 'Số nguyên 1-65535. Để trống = 22.'),
  col('auth_type', 'Auth type', 'r', 14, 'Cách xác thực.', 'sftp_auth_type'),
  col('key_vault_method', 'Phương thức lưu khoá', 'o', 20, 'Nơi giữ khoá/mật khẩu.', 'key_vault_method'),
  col('vault_account', 'Vault account', 'o', 20, 'Tối đa 255 ký tự. Không ghi mật khẩu thật vào file.'),
  col('folder_path', 'Thư mục', 'o', 24, 'Tối đa 1000 ký tự.'),
  col('file_name_pattern', 'Mẫu tên file', 'o', 26, 'Tối đa 500 ký tự. Vd CARD_TXN_{yyyyMMdd}.csv.'),
  col('file_format', 'Định dạng file', 'r', 14, 'Định dạng file.', 'file_format'),
  col('export_frequency', 'Tần suất xuất', 'r', 16, 'Tần suất xuất file.', 'export_frequency'),
  col('max_file_size', 'Dung lượng tối đa', 'o', 16, 'Số hoặc chữ, tối đa 255 ký tự. Vd 2GB.'),
  col('encryption', 'Mã hoá', 'r', 12, 'Mã hoá file.', 'encryption'),
  col('flow_direction', 'Chiều luồng', 'o', 12, 'Chiều luồng dữ liệu.', 'flow_direction'),
];

export const TERM_COLUMNS: ImportColumn[] = [
  col('service_ref', 'Mã tham chiếu DV', 'r', 16, 'Mã tham chiếu của dịch vụ ở sheet DICH_VU_API hoặc DICH_VU_SFTP.'),
  col(
    'table_name',
    'Tên bảng nguồn',
    'r',
    30,
    'Tối đa 255 ký tự. Bảng luôn được tạo mới: tên không được trùng bảng đã có trong hệ thống và không được dùng cho 2 dịch vụ trong file. Các dòng cùng dịch vụ + cùng tên bảng gom thành 1 bảng.',
  ),
  col('table_description', 'Mô tả bảng', 'o', 30, 'Tối đa 2000 ký tự. Lấy ở dòng đầu tiên của bảng.'),
  col(
    'code',
    'Mã physical term',
    'r',
    22,
    'Tên cột vật lý, tối đa 255 ký tự, không trùng trong cùng bảng (không phân biệt hoa thường).',
  ),
  col('technical_description', 'Mô tả kỹ thuật', 'r', 36, 'Tối đa 2000 ký tự.'),
  col('data_type', 'Data type', 'r', 18, 'Tối đa 100 ký tự. Vd VARCHAR(20), NUMBER(18,2), DATE.'),
  col('is_required', 'Bắt buộc', 'o', 10, 'Có hoặc Không. Để trống = Không.', 'yes_no'),
  col('example_value', 'Giá trị ví dụ', 'o', 22, 'Tối đa 1000 ký tự.'),
  col(
    'logical_code',
    'Mã logical term',
    'o',
    22,
    'Để trống = không map. Mã logical đã có trong hệ thống, hoặc mã khai ở sheet LOGICAL_TERM_MOI.',
  ),
];

export const LOGICAL_COLUMNS: ImportColumn[] = [
  col(
    'code',
    'Mã logical term',
    'r',
    26,
    'Mã logical term cần tạo mới, tối đa 255 ký tự, chưa có trong hệ thống. Phải được ít nhất 1 dòng ở BANG_NGUON_PHYSICAL_TERM dùng tới.',
  ),
  col('short_description', 'Mô tả ngắn', 'r', 50, 'Tối đa 400 ký tự.'),
  col('example_value', 'Giá trị ví dụ', 'o', 24, 'Tối đa 1000 ký tự.'),
];

export const SHEET_COLUMNS: Record<ImportDataSheet, ImportColumn[]> = {
  API: API_COLUMNS,
  SFTP: SFTP_COLUMNS,
  TERMS: TERM_COLUMNS,
  LOGICAL: LOGICAL_COLUMNS,
};

// Header text as written in the template: required columns end with " *".
export const headerText = (c: ImportColumn): string => (c.level === 'r' ? `${c.header} *` : c.header);

// Size caps of one upload.
export const IMPORT_LIMITS = {
  FILE_BYTES: 5 * 1024 * 1024,
  SERVICES: 200,
  TERM_ROWS: 5000,
  LOGICAL_ROWS: 1000,
  REF_LENGTH: 30,
  // Rows of the template that get formatting and dropdowns.
  TEMPLATE_ROWS: 1000,
} as const;
