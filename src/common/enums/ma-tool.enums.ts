// MA Tool domain enums extracted from Strapi schemas

export enum MaToolWorkspaceStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum MaToolStorageType {
  S3 = 's3',
  SFTP = 'sftp',
}

export enum MaToolUploadMethod {
  OVERRIDE = 'override',
  APPEND = 'append',
  SCD2 = 'scd2',
}

export enum MaToolFrequency {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export enum MaToolTemplateStatus {
  DRAFT = 'draft',
  SUBMIT = 'submit',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  APPROVAL = 'approval',
  REJECTED = 'rejected',
}

export enum MaToolTemplateType {
  MA_TOOL = 'ma-tool',
  BI_PAYMENT = 'bi-payment',
}

export enum MaToolWorkstepType {
  PREPARE = 'prepare',
  RECON_DATA = 'recon_data',
  RECON_FEEDBACK = 'recon_feedback',
  EX_PREPARE = 'ex_prepare',
}

export enum MaToolBranchConfigStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum MaToolDataServiceCenterStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum MaToolDataServiceCenterType {
  DATA_SHARING = 'DATA_SHARING',
  DATA_DELIVERY = 'DATA_DELIVERY',
  SELF_SERVE_QUERY_ENGINE = 'SELF_SERVE_QUERY_ENGINE',
  DATA_UPLOAD = 'DATA_UPLOAD',
  DATA_WORKFLOW = 'DATA_WORKFLOW',
}

export enum MaToolServiceConfigStorageType {
  S3 = 'S3',
  SFTP = 'SFTP',
}

export enum MaToolSbvRptCvtLogStatus {
  INIT = 'INIT',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAIL = 'FAIL',
}

export enum MaToolLogLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

export enum MaToolSheetColumnType {
  NUMBER = 'number',
  TEXT = 'text',
}

export enum MaToolValidationColumnType {
  TEXT = 'text',
  NUMBER = 'number',
  DATE = 'date',
  DATETIME = 'datetime',
  BOOLEAN = 'boolean',
}
