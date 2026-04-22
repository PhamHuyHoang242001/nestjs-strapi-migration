export const MIN_STR_LENGTH = 0;
export const MAX_STR_LENGTH = 255;
export const MAX_SERIAL_PRODUCT_LENGTH = 50;
export const MIN_PASSWORD_LENGTH = 4;
export const MAX_PASSWORD_LENGTH = 40;

export const MIN_PASSWORD_LENGTH_ADMIN = 6;
export const MAX_PASSWORD_LENGTH_ADMIN = 64;

export const MIN_EMAIL_LENGTH = 4;
export const MAX_EMAIL_LENGTH = 255;

export const MIN_PHONE_CODE_LENGTH = 0;
export const MIN_PHONE_LENGTH = 0;
export const MAX_PHONE_LENGTH = 12;

export const MIN_TEXT_LENGTH = 0;
export const MAX_TEXT_LENGTH = 1000;

export const MIN_ID_LENGTH = 1;
export const MAX_ID_LENGTH = 24;

export const MIN_NUMBER_LENGTH = 0;
export const MAX_NUMBER_LENGTH = 11;

export const MIN_NUMBER = 0;
export const MAX_NUMBER = 99999999999;

export const MIN_DECIMAL_LENGTH = 0;
export const MAX_DECIMAL_LENGTH = 11;

export const REGEX_PHONE = `^[0-9+]{1,}[0-9-]{6,19}$`;
export const REGEX_ACCOUNT_NUMBER = `^[a-zA-Z0-9]{1,100}$`;

export const REGEX_EMAIL = `^\\w+([.-]?\\w+)*@\\w+([.-]?\\w+)*(\\.\\w{2,6})+$`;
export const REGEX_NAME = `^(?=.{1,255}$)`;
export const REGEX_PASSWORD = /^(?=.*[a-zA-Z0-9])[a-zA-Z0-9[\]~`!@#$%^&*()_+={}|;:"",./?-]{5,40}$/;
export const REGEX_PRE_PHONE = '\\+';
export const REGEX_PRE_BEAR = 'Bearer ';
