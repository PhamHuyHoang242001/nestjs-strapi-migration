export enum STATUS {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum SortType {
  DESC = 'DESC',
  ASC = 'ASC',
}

export enum SortTypeNumber {
  DESC = -1,
  ASC = 1,
}

export enum DATA_TYPE {
  STRING = 'string',
  NUMBER = 'number',
  CURRENCY = 'currency',
  INTEGER = 'integer',
  FLOAT = 'float',
  INT = 'int',
  DOUBLE = 'double',
  BOOLEAN = 'boolean',
  JSON = 'json',
  OBJECT = 'object',

  ARRAY = 'array',
  DATETIME = 'datetime',
  OBJECTID = 'objectid',

  DATE = 'date',
  HTML = 'html',
  LONGTEXT = 'longtext',
  SIMPLEJSON = 'simple-json',
  UUID = 'uuid',
  UNDEFINED = 'undefined',
}
/**
 * tokentype
 */
export enum TOKEN_TYPE {
  RECOVER_PASSWORD,
  LOGIN,
  REFRESH_TOKEN,
  DELETE_ACCOUNT,
}

export enum GENDER {
  MALE,
  FEMALE,
  UNKNOW,
}

export enum USER_CLIENT {
  USER = 'user',
  TECHNICIAN = 'technician',
  OFFICER = 'officer',
  ADMIN = 'admin',
}

export enum ACTION_TYPE {
  UPDATE = 'update',
  CREATE = 'create',
  EXPORT = 'export',
  PRINT = 'print',
  DELETE = 'delete',
  SETSTATE = 'setstate',
  LIST = 'list',
  ALL = 'all',
}
export enum CHECK_ACCOUNT {
  LOGIN,
  CHECK_ACCOUNT,
}

export enum OTP_STATUS {
  PENDING = 'pending',
  ACTIVE = 'active',
  USED = 'used',
  EXPIRED = 'expired',
}

