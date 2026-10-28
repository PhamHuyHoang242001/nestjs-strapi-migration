// Column lists + input shapes for the per-type spec rows. One source of truth so reads, writes and
// snapshots always agree on which spec columns exist.

export const API_SPEC_FIELDS = [
  'method',
  'base_url',
  'endpoint_path',
  'auth_type',
  'token_endpoint',
  'token_auth_method',
  'peak_tps',
  'update_frequency',
  'sync_mode',
  'timeout',
  'sample_request',
  'sample_response',
] as const;

export const SFTP_SPEC_FIELDS = [
  'host',
  'port',
  'auth_type',
  'key_vault_method',
  'vault_account',
  'folder_path',
  'file_name_pattern',
  'file_format',
  'export_frequency',
  'max_file_size',
  'encryption',
  'flow_direction',
] as const;

export type ApiSpecField = (typeof API_SPEC_FIELDS)[number];
export type SftpSpecField = (typeof SFTP_SPEC_FIELDS)[number];

export type ApiSpecInput = { [K in ApiSpecField]?: unknown };
export type SftpSpecInput = { [K in SftpSpecField]?: unknown };

// Everything an edit/create body says about a version, independent of how it arrived (DTO or DB row).
export interface VersionSource {
  name: string;
  short_description: string;
  purpose?: string | null;
  usage_guide_html: string;
  request_unit_id: number;
  division_id: number;
  department_id: number;
  api_spec?: ApiSpecInput | null;
  sftp_spec?: SftpSpecInput | null;
  requester_user_ids: number[];
  it_supporter_user_ids: number[];
  consumer_ids: number[];
  physical_term_ids: number[];
}
