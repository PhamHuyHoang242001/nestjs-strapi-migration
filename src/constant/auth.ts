import { USER_CLIENT } from '@common/enums';
/**
 * tokentype
 */

export const TOKEN_TIME = {
  // [`${USER_CLIENT.USER}_TIME`]: 5,
  // [`${USER_CLIENT.USER}_REFRESH`]: 10, // 24 * 60 minutes = 1 day
  [`${USER_CLIENT.USER}_TIME`]: 30, // 30 minutes
  [`${USER_CLIENT.USER}_REFRESH`]: 24 * 60, // 24 * 60 minutes = 1 day

  [`${USER_CLIENT.TECHNICIAN}_TIME`]: 61 * 24 * 60,
  [`${USER_CLIENT.TECHNICIAN}_REFRESH`]: 61 * 24 * 60 + 10,

  [`${USER_CLIENT.ADMIN}_TIME`]: 30,
  [`${USER_CLIENT.ADMIN}_REFRESH`]: 15 * 24 * 60,

  RECOVER_PASSWORD: 10,
  DELETE_ACCOUNT: 10,
};

export const CLIENT_TOKEN = [
  {
    client: USER_CLIENT.ADMIN,
    token: 'b2ZmaWNlcl9mYW5jaG86MXN1TEp2RVF0WnBVSFRuSUpQbCsrTUczQll0b2hidmNZa3J2TUtSTEVUamc=',
  },
  {
    client: USER_CLIENT.USER,
    token: 'dXNlcl9mYW5jaG86dmRkc2Vtbm1SdDdRSSs4ZmY0V2krZTJubENCTURsMkN1RklUVFdGZ2lkZlk=',
  },
];

export const USER_DELETED_TIME: any = {
  TIME: 5,

  UNIT: 'days',
  TIME_SEND_MAIL: 2,
};

export const FORMAT_TIME_USER_DELETED_DATE = 'HH:mm';
export const FORMAT_DATE_USER_DELETED_DATE = 'DD-MM-YYYY';
