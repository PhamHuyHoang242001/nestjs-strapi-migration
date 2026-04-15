// Data Self-Serve domain enums extracted from Strapi schemas

export enum DataSelfServeRequestStatus {
  SUCCESSFULLY = 'successfully',
  FAILED = 'failed',
  PROCESSING = 'processing',
  SUBMITED = 'submited',
  DRAFT = 'draft',
}

export enum DataSelfServeRequestGroup {
  EDAPORTAL_TRACUULICHTRANO = 'EDAPORTAL_TRACUULICHTRANO',
}

export enum DataSelfServeValidationStatus {
  PROCESSING = 'processing',
  SUCCESSFULLY = 'successfully',
  FAILED = 'failed',
}

export enum DataSelfServeUploadMethod {
  MANUAL = 'manual',
  UPLOAD = 'upload',
}

export enum DataSelfServeStorageType {
  S3 = 's3',
  SFTP = 'sftp',
}
