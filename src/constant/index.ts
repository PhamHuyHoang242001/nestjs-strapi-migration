// eslint-disable-next-line @typescript-eslint/no-require-imports
(require('dotenv') as { config: () => void }).config();

export * from './country';
export * from './data-default';
export * from './error-messages';
export * from './validation';

export const NODE_ENVIRONMENT = {
  DEV: 'development',
  PROD: 'prod',
};

export const SALT = 10;

export const DEFAULT_AVATAR = 'hpg/1705561583968_unnamed.png';
export const FORMAT_DATE = 'YYYY-MM-DD HH:mm:ss'; // đầu vào database transDate
/**
 * key encrypt token
 */

export const PAGE_DEFAULT = 1;
export const PERPAGE_DEFAULT = 10;
export const PERPAGE_MAXIMUM = 100;
export const SORT_DEFAULT = 'created_at';
export const LIMIT_GET_ALL = 500;

export const FILE_IMAGE_EXTENSIONS_PREFIX = /^.*.(jpg|png|svg|hiec|heif|jpeg)$/i;
export const FILE_DOCX_EXTENSIONS_PREFIX = /^.*.(vnd.openxmlformats-officedocument.wordprocessingml.document|msword)$/i;

export const MAX_SIZE_IMAGE_CAMPAIGN_COVER = 8 * 1000 * 1000;
export const MAX_SIZE_IMAGE_AVATAR = 2 * 1000 * 1000;

export const MAX_SIZE_EXCEL = 8 * 1000 * 1000;

export const CHARACTER_SEPARATE_SUB_INFO = '=-';

export const MAPPING_ENCRYPT_TOKEN = [
  { fieldMapping: 'timestamp', fieldName: 'time' },
  { fieldMapping: 'client', fieldName: 'cl' },
  { fieldMapping: 'user_id', fieldName: 'uid' },
  { fieldMapping: 'expired_at', fieldName: 'exp' },
];

export const MAPPING_ENCRYPT_DEVICEID = {
  1: 'browser',
  2: 'browserVersion',
  3: 'osVersion',
  5: 'deviceName',
  6: 'device',
  7: 'userAgent',
};
export const ENABLE_CRONJOB = 'enable';
export const ENABLE_UPLOAD_EXCEL = 'enable';
export const ENABLE_SEND_MAIL = 'enable';
export const ENABLE_SEND_NOTIFICATION = 'enable';
export const ENABLE_SEND_SMS = 'enable';
export const MAX_ROW_UPLOAD_EXCEL = 1002;
export const MAX_ROW_UPLOAD_PRODUCT_ACTIVATION_CODE = 30000;

export const LIMIT_THROTTLE = {
  ttl: 100000,
  limit: 60000,
};

// 20 requests per second
export const LIMIT_SHIPMENT_THROTTLE = {
  ttl: 1,
  limit: 10,
};

export enum TIME_LIMIT_PAYMENT {
  PROCESS_SYSTEM_CREATE_ORDER = 5, // seconds
  EXPIRE_TIME_ORDER = 20 * 60, // seconds
}

export const MAX_PRODUCT_IN_CART = 99;
