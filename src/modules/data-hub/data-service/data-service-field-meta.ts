// Labels and comparison kind of every field that can appear in a data service change log.
// `field` is the snapshot key; spec fields are prefixed api_ / sftp_.

export type FieldKind = 'scalar' | 'json' | 'ref' | 'refList';
export type ChangeSection = 'general' | 'business' | 'technical' | 'guide' | 'links';

export interface FieldMeta {
  field: string;
  section: ChangeSection;
  kind: FieldKind;
  label_vi: string;
  label_en: string;
}

const f = (field: string, section: ChangeSection, kind: FieldKind, label_vi: string, label_en: string): FieldMeta => ({
  field,
  section,
  kind,
  label_vi,
  label_en,
});

export const FIELD_META: FieldMeta[] = [
  f('name', 'general', 'scalar', 'Tên dịch vụ', 'Service name'),
  f('short_description', 'general', 'scalar', 'Mô tả ngắn', 'Short description'),
  f('purpose', 'general', 'scalar', 'Mục đích sử dụng', 'Purpose'),
  f('status', 'general', 'scalar', 'Trạng thái', 'Status'),

  f('request_unit', 'business', 'ref', 'Đơn vị yêu cầu', 'Request unit'),
  f('division', 'business', 'ref', 'Khối', 'Division'),
  f('department', 'business', 'ref', 'Phòng ban', 'Department'),
  f('requesters', 'business', 'refList', 'Người yêu cầu', 'Requesters'),
  f('it_supporters', 'business', 'refList', 'IT hỗ trợ', 'IT supporters'),

  f('api_method', 'technical', 'scalar', 'Phương thức', 'HTTP method'),
  f('api_base_url', 'technical', 'scalar', 'Base URL', 'Base URL'),
  f('api_endpoint_path', 'technical', 'scalar', 'Endpoint', 'Endpoint path'),
  f('api_auth_type', 'technical', 'scalar', 'Kiểu xác thực', 'Auth type'),
  f('api_token_endpoint', 'technical', 'scalar', 'Token endpoint', 'Token endpoint'),
  f('api_token_auth_method', 'technical', 'scalar', 'Cách xác thực token', 'Token auth method'),
  f('api_peak_tps', 'technical', 'scalar', 'TPS cao điểm', 'Peak TPS'),
  f('api_update_frequency', 'technical', 'scalar', 'Tần suất cập nhật', 'Update frequency'),
  f('api_sync_mode', 'technical', 'scalar', 'Chế độ đồng bộ', 'Sync mode'),
  f('api_timeout', 'technical', 'scalar', 'Timeout', 'Timeout'),
  f('api_sample_request', 'technical', 'json', 'Request mẫu', 'Sample request'),
  f('api_sample_response', 'technical', 'json', 'Response mẫu', 'Sample response'),

  f('sftp_host', 'technical', 'scalar', 'Host SFTP', 'SFTP host'),
  f('sftp_port', 'technical', 'scalar', 'Cổng', 'Port'),
  f('sftp_auth_type', 'technical', 'scalar', 'Kiểu xác thực SFTP', 'SFTP auth type'),
  f('sftp_key_vault_method', 'technical', 'scalar', 'Phương thức lưu khóa', 'Key vault method'),
  f('sftp_vault_account', 'technical', 'scalar', 'Tài khoản vault', 'Vault account'),
  f('sftp_folder_path', 'technical', 'scalar', 'Thư mục', 'Folder path'),
  f('sftp_file_name_pattern', 'technical', 'scalar', 'Mẫu tên tệp', 'File name pattern'),
  f('sftp_file_format', 'technical', 'scalar', 'Định dạng tệp', 'File format'),
  f('sftp_export_frequency', 'technical', 'scalar', 'Tần suất xuất', 'Export frequency'),
  f('sftp_max_file_size', 'technical', 'scalar', 'Dung lượng tệp tối đa', 'Max file size'),
  f('sftp_encryption', 'technical', 'scalar', 'Mã hóa', 'Encryption'),
  f('sftp_flow_direction', 'technical', 'scalar', 'Chiều truyền', 'Flow direction'),

  f('usage_guide_html', 'guide', 'scalar', 'Hướng dẫn sử dụng (HTML)', 'Usage guide (HTML)'),

  f('consumers', 'links', 'refList', 'App thụ hưởng', 'Consumers'),
  f('source_tables', 'links', 'refList', 'Bảng nguồn dịch vụ', 'Source tables'),
  // Labelled `bảng nguồn.code — mô tả (vd) → logical`; any field change of a term shows as removed + added.
  f('physical_terms', 'links', 'refList', 'Thuật ngữ nghiệp vụ theo bảng nguồn', 'Physical terms by source table'),
];
