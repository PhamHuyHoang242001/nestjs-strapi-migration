// Enums for the Data Hub tables. Stored as VARCHAR + CHECK; values must match
// migration 2610221500-create-data-hub-tables (changing one needs a migration).

export enum DataHubServiceType {
  API = 'API',
  SFTP = 'SFTP',
}

export enum DataHubStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum DataHubConsumerCategory {
  INTERNAL_APP = 'INTERNAL_APP',
  PARTNER_ECOSYSTEM = 'PARTNER_ECOSYSTEM',
}

// Logical term history actions
export enum DataHubHistoryAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
}

// Data service and consumer history actions; STATUS = active/inactive toggle
export enum DataHubServiceHistoryAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  STATUS = 'STATUS',
}

// Review state of a data service version (all edits are auto-approved until review is enabled)
export enum DataHubVersionState {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum DataHubApiMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
}

export enum DataHubApiBaseUrl {
  API_INT = 'API_INT',
  API_EXT = 'API_EXT',
  API_OPEN = 'API_OPEN',
  API_UAT = 'API_UAT',
  API = 'API',
}

// Host behind each base URL code (FE shows the host; DB stores the code)
export const DATA_HUB_API_BASE_URL_HOSTS: Record<DataHubApiBaseUrl, string> = {
  [DataHubApiBaseUrl.API_INT]: 'api-int.vpbank.com.vn',
  [DataHubApiBaseUrl.API_EXT]: 'api-ext.vpbank.com.vn',
  [DataHubApiBaseUrl.API_OPEN]: 'api-open.vpbank.com.vn',
  [DataHubApiBaseUrl.API_UAT]: 'api-uat.vpbank.com.vn',
  [DataHubApiBaseUrl.API]: 'api.vpbank.com.vn',
};

export enum DataHubApiAuthType {
  X_SECRET_KEY = 'X_SECRET_KEY',
  X_IBM_CLIENT_ID = 'X_IBM_CLIENT_ID',
  X_IBM_CLIENT_SECRET = 'X_IBM_CLIENT_SECRET',
  CLIENT_ID = 'CLIENT_ID',
  BEARER_TOKEN = 'BEARER_TOKEN',
}

export enum DataHubApiTokenAuthMethod {
  BASIC = 'BASIC',
  X_SECRET_KEY = 'X_SECRET_KEY',
  X_IBM_CLIENT_ID = 'X_IBM_CLIENT_ID',
}

export enum DataHubApiUpdateFrequency {
  REALTIME = 'REALTIME',
  NEAR_REALTIME = 'NEAR_REALTIME',
  DAILY_D1 = 'DAILY_D1',
  ADHOC = 'ADHOC',
}

export enum DataHubApiSyncMode {
  SYNC = 'SYNC',
  ASYNC = 'ASYNC',
  BATCH = 'BATCH',
}

export enum DataHubSftpAuthType {
  SSH_KEY = 'SSH_KEY',
  PASSWORD = 'PASSWORD',
}

export enum DataHubSftpKeyVaultMethod {
  CYBERARK_PAM = 'CYBERARK_PAM',
  LOCAL_KEYSTORE = 'LOCAL_KEYSTORE',
  HSM_VAULT = 'HSM_VAULT',
}

export enum DataHubSftpFileFormat {
  CSV = 'CSV',
  CSV_PIPE = 'CSV_PIPE',
  PARQUET = 'PARQUET',
  XLSX = 'XLSX',
  JSON = 'JSON',
}

export enum DataHubSftpExportFrequency {
  DAILY_0200 = 'DAILY_0200',
  HOURLY = 'HOURLY',
  W_1 = 'W_1',
  M_1 = 'M_1',
  ADHOC = 'ADHOC',
}

export enum DataHubSftpEncryption {
  PGP_KEY = 'PGP_KEY',
  NONE = 'NONE',
}

export enum DataHubSftpFlowDirection {
  PUSH = 'PUSH',
  PULL = 'PULL',
}

// One changed field in a data service edit, stored in data_hub_data_service_histories.changes
export interface DataHubServiceChange {
  section: string;
  field: string;
  label_vi: string;
  label_en: string;
  old: unknown;
  new: unknown;
}
