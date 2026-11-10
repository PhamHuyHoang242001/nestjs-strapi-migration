// Pure mapping helpers for seed-data-hub-mock-data.ts: Mock-EDA-Portal JSON → data_hub_* rows.
// The mock data uses free-text / legacy values; each mapper returns a valid enum value and reports
// when it had to approximate, so the seed summary shows how lossy the import was.

export interface OrgSeed {
  code: string;
  name: string;
}

// Hardcoded lists in the mock HTML (create/catalog/consumers pages).
export const DIVISIONS: OrgSeed[] = [
  { code: 'EDA', name: 'Khối Quản trị & Phân tích Dữ liệu (EDA)' },
  { code: 'IT', name: 'Khối Công nghệ Thông tin (IT)' },
  { code: 'WS_RB', name: 'Khối Khách hàng Cá nhân (RB)' },
  { code: 'WS_SME', name: 'Khối KHDN Vừa & Nhỏ (SME)' },
  { code: 'WS_COMM', name: 'Khối Khách hàng Doanh nghiệp (COMM)' },
  { code: 'WS_RISK', name: 'Khối Quản trị Rủi ro (RISK)' },
  { code: 'WS_FIN', name: 'Khối Tài chính Kế toán (FIN)' },
  { code: 'WS_OPS', name: 'Khối Vận hành (OPS)' },
  { code: 'WS_IT', name: 'Khối CNTT (IT)' },
  { code: 'WS_DGO', name: 'Khối Ngân hàng Số (Digital Banking)' },
];

export const DEPARTMENTS: OrgSeed[] = [
  'DPD',
  'C360',
  'DWH',
  'DSE',
  'EDA',
  'DPIS',
  'CORE',
  'INFRA',
  'SEC',
  'DF',
  'BI',
  'DBS',
].map((code) => ({ code, name: code }));

export const REQUEST_UNITS: OrgSeed[] = [
  { code: 'DBS', name: 'Khối Ngân hàng Số (DBS)' },
  { code: 'RB', name: 'Khối Khách hàng Cá nhân (RB)' },
  { code: 'SME', name: 'Khối KHDN Vừa & Nhỏ (SME)' },
  { code: 'CIB', name: 'Khối KHDN Lớn & Định chế (CIB)' },
  { code: 'FE', name: 'FE Credit (FE)' },
  { code: 'CRM_360', name: 'Customer 360 (CRM_360)' },
  { code: 'AML', name: 'Phòng chống Rửa tiền (AML)' },
  { code: 'RISK', name: 'Khối Quản trị Rủi ro (RISK)' },
  { code: 'AF', name: 'Khối Tài chính Kế toán (AF)' },
  { code: 'ITG', name: 'Khối Công nghệ Thông tin (ITG)' },
  { code: 'DPD', name: 'Phòng Phát triển Dữ liệu (DPD)' },
  { code: 'DWH', name: 'Kho Dữ liệu (DWH)' },
  { code: 'OPS', name: 'Khối Vận hành (OPS)' },
  { code: 'HR', name: 'Khối Quản trị Nguồn nhân lực (HR)' },
];

// Service workspace code → request unit (BU) code.
const WORKSPACE_TO_REQUEST_UNIT: Record<string, string> = {
  WS_RB: 'RB',
  WS_SME: 'SME',
  WS_COMM: 'CIB',
  WS_RISK: 'RISK',
  WS_FIN: 'AF',
  WS_OPS: 'OPS',
  WS_IT: 'ITG',
  WS_DGO: 'DBS',
};

export class MapWarnings {
  readonly counts = new Map<string, number>();
  add(key: string): void {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }
}

export const requestUnitCode = (workspace: string, w: MapWarnings): string => {
  const code = WORKSPACE_TO_REQUEST_UNIT[workspace];
  if (code) return code;
  w.add(`request_unit:${workspace}→DBS`);
  return 'DBS';
};

const pick = <T extends string>(value: string, map: Record<string, T>, fallback: T, label: string, w: MapWarnings) => {
  const hit = map[value];
  if (hit) return hit;
  w.add(`${label}:${value}→${fallback}`);
  return fallback;
};

export const apiUpdateFrequency = (v: string, w: MapWarnings) =>
  pick(
    v,
    { Realtime: 'REALTIME', 'Near-realtime': 'NEAR_REALTIME', 'Hàng ngày (D-1)': 'DAILY_D1' },
    'ADHOC',
    'freq',
    w,
  );

export const apiAuthType = (v: string, w: MapWarnings) =>
  pick(
    v,
    { OAUTH2_BEARER: 'BEARER_TOKEN', X_SECRET_KEY: 'X_SECRET_KEY', CLIENT_ID: 'CLIENT_ID' },
    'BEARER_TOKEN',
    'auth',
    w,
  );

// Url of a seeded row in `integration_domain_configs` (see the integration domain config migration).
export const apiDomainUrl = (domain: string, w: MapWarnings) => {
  const host = domain.replace(/^https?:\/\//, '').split(/[/:]/)[0];
  const map: Record<string, string> = {
    'api-int.vpbank.com.vn': 'https://api-int.vpbank.com.vn',
    'api-ext.vpbank.com.vn': 'https://api-ext.vpbank.com.vn',
    'api-open.vpbank.com.vn': 'https://api-open.vpbank.com.vn',
    'api-uat.vpbank.com.vn': 'https://api-uat.vpbank.com.vn',
    'api.vpbank.com.vn': 'https://api.vpbank.com.vn',
  };
  return pick(host, map, 'https://api-int.vpbank.com.vn', 'domain', w);
};

export const sftpFileFormat = (v: string, w: MapWarnings) =>
  pick(
    v,
    { CSV: 'CSV', CSV_PIPE: 'CSV_PIPE', PARQUET: 'PARQUET', XLSX: 'XLSX', JSON: 'JSON', AVRO: 'PARQUET' },
    'CSV',
    'format',
    w,
  );

export const sftpExportFrequency = (v: string, w: MapWarnings) =>
  pick(
    v,
    { DAILY_0200: 'DAILY_0200', HOURLY: 'HOURLY', WEEKLY: 'W_1', MONTHLY_01: 'M_1' },
    'DAILY_0200',
    'sftp_freq',
    w,
  );

// Mock status → package status. No review flow yet, so pending/draft/rejected become live services.
export const serviceStatus = (v: string): 'active' | 'inactive' => (v === 'Inactive' ? 'inactive' : 'active');

export const truncate = (v: string | null | undefined, max: number): string => (v ?? '').slice(0, max);
