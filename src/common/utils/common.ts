/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
/* eslint-disable @typescript-eslint/no-require-imports */
import {
  CHARACTER_SEPARATE_SUB_INFO,
  DATA_INVALID,
  LIMIT_GET_ALL,
  MAPPING_ENCRYPT_DEVICEID,
  MAPPING_ENCRYPT_TOKEN,
  SALT,
  STATUS_CODE_DEFAULT,
  SUCCESS,
} from '@constant/index';
import axios from 'axios';
import * as bcrypt from 'bcryptjs';
import * as dayjs from 'dayjs';
import * as _ from 'lodash';
import { PaginationTypeEnum, paginate } from 'nestjs-typeorm-paginate';
import {
  decryptCryptoDecipher,
  encryptCryptoDecipher,
  encryptMD5,
  randomBytesCrypto,
  sha256Password,
} from '../../service/cryptoJs';
import i18n from '../../service/i18n';
import * as uuid from 'uuid';
import isUUID from 'validator/lib/isUUID';
import { DATA_TYPE, LANGUAGE, STATUS, USER_STATUS } from '../enums';
import { ENCRYPT_KEY } from '@configuration/env.config';
const phoneUtil = require('libphonenumbers').PhoneNumberUtil.getInstance();

const DIGIT_NUMBER = '0123456789';
const CHARACTERS_LOWER_CASE = 'abcdefghijklmnopqrstuvwxyz';
const CHARACTERS_CAPITALIZE = CHARACTERS_LOWER_CASE.toUpperCase();
export const CHARACTERS = `${CHARACTERS_CAPITALIZE}${CHARACTERS_LOWER_CASE}${DIGIT_NUMBER}`;

const common: any = {
  STATUS_MAPPING: [],
  USER_STATUS: [],
};
export const hashPassword = (password: string) => {
  return bcrypt.hashSync(password, SALT);
};

export const comparePassword = (password: string, hash: string) => {
  return bcrypt.compareSync(password, hash);
};
export const encrypt = (input) => {
  return encryptCryptoDecipher(input, ENCRYPT_KEY);
};

export const decrypt = (input) => {
  return decryptCryptoDecipher(input, ENCRYPT_KEY);
};
export const encryptBiometrict = (input) => {
  return encryptMD5(input);
};
export const randomUuidV4 = () => {
  return uuid.v4();
};
export const randomUuidSms = () => {
  return randomUuidV4().replace(/-/g, '');
};
export const randomStringUuid = () => {
  return `${randomUuidV4()}-${dayjs().valueOf()}`;
};

export const i18nMsg = (message: string, payload?: object) => {
  // translate message
  if (!message) return '';
  if (!payload) message = i18n.__(message);
  else message = i18n.__(message, payload);
  return message;
};

export const i18nMsgByLanguage = (message: string, payload?: object) => {
  // translate message
  if (!message) return '';
  const output = {};
  Object.values(LANGUAGE).forEach((lang) => {
    if (!payload) output[lang] = i18n.__({ phrase: message, locale: lang });
    else output[lang] = i18n.__({ phrase: message, locale: lang }, payload);
  });

  return output;
};

export const generateToken = (input) => {
  const token = encryptCryptoDecipher(input, ENCRYPT_KEY);
  return `${token}${CHARACTER_SEPARATE_SUB_INFO}${randomStringUuid()}`;
};

export const decryptToken = (input: string) => {
  const [token] = input.split(CHARACTER_SEPARATE_SUB_INFO);
  let dataDecypt = decryptCryptoDecipher(token, ENCRYPT_KEY);
  if (dataDecypt) dataDecypt = JSON.parse(dataDecypt);

  const value = {};
  MAPPING_ENCRYPT_TOKEN.forEach((u) => {
    value[u.fieldMapping] = dataDecypt[u.fieldName];
  });
  return value;
};

export const success = (data) => {
  let output: any = {
    message: i18nMsg(SUCCESS),
    statusCode: STATUS_CODE_DEFAULT,
  };
  output = Object.assign(output, data);
  return output;
};

export const getCountryByIp = async (ip: string) => {
  if (ip === '::1') {
    return '';
  }
  const url = `http://ip-api.com/json/${ip}`;
  const response = await axios.get(url);
  return response.data.country || response.data.countryCode;
};

export const validateDatatype = (value, typeMask) => {
  switch (typeMask) {
    case DATA_TYPE.NUMBER:
      return !isNaN(value);
    case DATA_TYPE.INTEGER:
    case DATA_TYPE.INT:
      return !isNaN(value) && parseInt(value) === Number(value);
    case DATA_TYPE.FLOAT:
    case DATA_TYPE.DOUBLE:
      return !isNaN(value) && parseFloat(value) === Number(value);
    case DATA_TYPE.BOOLEAN:
      return value === 'true' || value === 'false' || typeof value === DATA_TYPE.BOOLEAN;
    case DATA_TYPE.STRING:
      return typeof value === DATA_TYPE.STRING;
    case DATA_TYPE.ARRAY:
      return Array.isArray(value);
    case DATA_TYPE.JSON:
      return typeof value === DATA_TYPE.OBJECT;
    case DATA_TYPE.OBJECT:
      return typeof value === DATA_TYPE.OBJECT;
    case DATA_TYPE.DATETIME:
      if (value instanceof Date) return true;
      if (typeof value === 'string' || typeof value === 'number') return dayjs(value).isValid();
      return false;
    case DATA_TYPE.DATE:
      if (value instanceof Date) return true;
      if (typeof value === 'string' || typeof value === 'number') return dayjs(value).isValid();
      return false;
    case DATA_TYPE.UUID:
      return isUUID(value);

    default:
      return true;
  }
};
export const validateInput = (input, regex) => {
  const re = new RegExp(regex, 'g');
  const result = re.test(input);
  return !!result;
};
function getFieldLength(field: any) {
  return !Array.isArray(field) ? (field || '').toString().length : field.length;
}
export const validateFields = (requiredFields) => {
  try {
    for (const objField of requiredFields) {
      const fieldLength = getFieldLength(objField.field);

      if (
        (!objField.noRequired && !objField.field) ||
        (objField.dataType && objField.field && !validateDatatype(objField.field, objField.dataType)) ||
        (objField.minLength && objField.field && fieldLength < objField.minLength) ||
        (objField.maxLength && objField.field && fieldLength > objField.maxLength) ||
        (objField.regex && objField.field && !validateInput(objField.field, objField.regex))
      ) {
        const output = Object.assign(
          { statusCode: 400, message: DATA_INVALID },
          {
            validation: true,
            fieldName: objField.fieldName,
            message: i18nMsg(objField.message, objField.dataTranslate),
          },
        );
        return output;
      }
    }
    return true;
  } catch (error) {
    return error;
  }
};

export const toCamelKey = (key: string) => {
  return _.camelCase(key);
};
export const toSnakeKey = (key: string) => {
  return _.snakeCase(key);
};
export const snakeCaseToCamelCase = (data: any) => {
  if (Array.isArray(data)) {
    return data.map((v) => snakeCaseToCamelCase(v));
  } else if (data != null && validateDatatype(data, DATA_TYPE.DATETIME)) {
    return data;
  } else if (data != null && _.isObject(data)) {
    return Object.keys(data).reduce(
      (result, key) => ({
        ...result,
        [toCamelKey(key)]: snakeCaseToCamelCase(data[key]),
      }),
      {},
    );
  }
  return data;
};

export const camelCaseToSnakeCase = (data: any) => {
  if (Array.isArray(data)) {
    return data.map((v) => camelCaseToSnakeCase(v));
  } else if (data != null && validateDatatype(data, DATA_TYPE.DATETIME)) {
    return data;
  } else if (data != null && _.isObject(data)) {
    return Object.keys(data).reduce(
      (result, key) => ({
        ...result,
        [toSnakeKey(key)]: camelCaseToSnakeCase(data[key]),
      }),
      {},
    );
  }
  return data;
};

export const setDefaulSort = (data: any) => {
  if (!data || !_.isObject(data)) return data;
  const key = Object.keys(data).find((key) => key === 'sort');
  if (key) {
    const sort = data['sort'];
    if (sort?.createdAt || sort?.created_at) {
      sort['created_at'] = sort?.createdAt ? sort?.createdAt : sort?.created_at;
    } else {
      sort['created_at'] = 'desc';
    }
    data['sort'] = camelCaseToSnakeCase({ ...sort });
  }
  return data;
};

export const randomString = (length, charsSet) => {
  const chars = charsSet;
  if (length <= 0 || !charsSet) return '';

  const rnd = randomBytesCrypto(length),
    value = new Array(length),
    len = chars.length;

  for (let i = 0; i < length; i++) {
    value[i] = chars[rnd[i] % len];
  }

  return value.join('');
};

export const generateOtp = () => {
  return randomString(4, DIGIT_NUMBER);
};

export const generateCode = () => {
  return {
    verifyCode: generateOtp(),
    verifyCodeExpired: new Date().getTime() + 60 * 1000,
  };
};

export const randomPassword = (length: number = 10) => {
  const password =
    randomString(1, CHARACTERS_CAPITALIZE) +
    randomString(1, CHARACTERS_LOWER_CASE) +
    randomString(1, DIGIT_NUMBER) +
    randomString(length - 3, CHARACTERS);

  return { password: sha256Password(password), original_password: password };
};

export const randomCode = (length: number = 10) => {
  const charactersNoDigit = CHARACTERS.replace(DIGIT_NUMBER, '');
  return randomString(length - 1, charactersNoDigit);
};

export const flatFields = (originalData, nested, fullKey?, key?) => {
  fullKey = fullKey ? fullKey + '.' + key : key || '';
  if ((originalData !== nested && typeof nested !== DATA_TYPE.OBJECT) || !nested) {
    if (!originalData[fullKey]) originalData[fullKey] = nested;
    return;
  } else if (fullKey && key) {
    if (!originalData[fullKey]) originalData[fullKey] = nested;
  }

  Object.keys(nested).forEach((k) => {
    flatFields(originalData, nested[k], fullKey, k);
  });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const mapFieldValueExcel = (cell, _dataType: DATA_TYPE) => {
  let rs;
  if (cell?.formulaType) {
    rs = cell?._value?.model?.result;
  } else if (cell?._value?.model?.value?.richText) rs = cell?.text;
  else rs = cell?._value?.model?.value;

  return (rs || '').toString().trim();
};

export const encryptDevice = (domain: string, device: object) => {
  let value = domain;
  Object.values(MAPPING_ENCRYPT_DEVICEID).forEach((u) => (value += `_${device[u]}`));
  return encryptMD5(value);
};

export const loopData = (input: any, key: string, fieldMapping: string, output: string[] = []) => {
  Object.keys(input).forEach((k) => {
    if (k === key) {
      output.push(input[key][fieldMapping]);
      return loopData(input[key], key, fieldMapping, output);
    }
  });
  return output;
};
export const mapTree = (arr: string[]) => {
  return [...arr].reverse().join('/');
};
export const mapParentRef = (input: any, include_current_level: boolean = false) => {
  if (!input) return '';
  const parent = loopData(input, 'parent', 'name');
  if (include_current_level) parent.unshift(input?.name);
  return mapTree(parent);
};

export const standardizePagination = (
  totalItems: number,
  itemCount: number,
  itemsPerPage: number,
  currentPage: number = 1,
) => {
  const output = { currentPage, itemsPerPage, totalItems, itemCount, totalPages: 0 };

  output.totalPages = Math.ceil(output.totalItems / (output.itemsPerPage || 1));
  return output;
};
export const execQueryPaignation = async (queryBuilder, page, limit) => {
  const result = await queryBuilder
    .skip((page - 1) * limit)
    .take(limit)
    .getMany();
  const count = await queryBuilder.getCount();
  const meta = standardizePagination(count, result.length, limit, page);
  /**
   * import { paginate, PaginationTypeEnum } from 'nestjs-typeorm-paginate';
   *  const result = await paginate(queryBuilder, { page, limit, paginationType: PaginationTypeEnum.TAKE_AND_SKIP });
   */

  return {
    data: result,
    meta,
  };
};

export const execQueryPaginate = async (queryBuilder, page, limit) => {
  const result = await paginate(queryBuilder, { page, limit, paginationType: PaginationTypeEnum.TAKE_AND_SKIP });
  return {
    data: result.items,
    meta: result.meta,
  };
};

export const execQueryAll = async (queryBuilder) => {
  const options = { skip: 0, limit: LIMIT_GET_ALL };
  let result = [];
  while (true) {
    const data = await queryBuilder.skip(options.skip).take(options.limit).getMany();
    if (!data?.length) break;
    result = result.concat(data);
    if (data?.length < options.limit) break;
    options.skip += options.limit;
  }
  return {
    data: result,
    meta: { totalItems: result.length },
  };
};

export function padTo2Digits(num: number) {
  return num.toString().padStart(2, '0');
}

export function formatDate(date: Date) {
  if (!date) {
    return null;
  }
  return [date.getFullYear(), padTo2Digits(date.getMonth() + 1), padTo2Digits(date.getDate())].join('-');
}

export function getCurrentDate() {
  const current = new Date();
  return new Date(current.getFullYear(), current.getMonth(), current.getDate());
}

export function toDate(date: Date) {
  if (!date) {
    return null;
  }
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function toStrDate(date: Date) {
  if (!date) {
    return null;
  }
  return (
    date.getFullYear().toString() +
    '-' +
    padTo2Digits(date.getMonth() + 1) +
    '-' +
    padTo2Digits(date.getDate()) +
    'T' +
    padTo2Digits(date.getHours()) +
    ':' +
    padTo2Digits(date.getMinutes()) +
    ':' +
    padTo2Digits(date.getSeconds())
  );
}

export function groupBy<T, K>(listData: T[], getKey: (o: T) => K) {
  const group = new Map<K, T[]>();
  for (const data of listData) {
    const key = getKey(data);
    if (group.get(key)) {
      group.get(key).push(data);
    } else {
      group.set(key, [data]);
    }
  }
  return group;
}

export function isEmptyList(data: any[]) {
  return !data || data.length == 0;
}

export function includeById<T>(id: T, obs: { id: T }[]) {
  for (const ob of obs) {
    if (ob.id == id) {
      return true;
    }
  }
  return false;
}

export function getListIdNotInById<T>(childIds: T[], parents: { id: T }[]) {
  const parentIds = parents.map((p) => p.id);
  return childIds.filter((childId) => !parentIds.includes(childId));
}

export function getListNotInById<ID, OB extends { id: ID }>(childs: OB[], parents: OB[]) {
  const parentIds = parents.map((p) => p.id);
  return childs.filter((child) => !parentIds.includes(child.id));
}

export function filters<T>(data: T[], filterCondition: (d: T) => boolean): T[] {
  if (!data) {
    return [];
  }
  return data.filter((d) => filterCondition(d));
}

export function removeDuplicate<T>(listData: T[]): T[] {
  return listData.reduce((o1, o2) => {
    if (!o1.includes(o2)) {
      o1.push(o2);
    }
    return o1;
  }, []);
}

export function removeDuplicateIgnoreUndefind<T>(listData: T[]): T[] {
  return listData.reduce((o1, o2) => {
    if (o2 != undefined && !o1.includes(o2)) {
      o1.push(o2);
    }
    return o1;
  }, []);
}

export const initConfigSystem = () => {
  let dataTemp: any = { ...STATUS };
  common.STATUS_MAPPING = Object.keys(dataTemp).map((key) => {
    return { code: key, value: dataTemp[key], name: i18nMsgByLanguage(`common_status_${dataTemp[key]}`) };
  });

  dataTemp = { ...USER_STATUS };
  common.USER_STATUS = Object.keys(dataTemp).map((key) => {
    return { code: key, value: dataTemp[key], name: i18nMsgByLanguage(`user_status_${dataTemp[key]}`) };
  });
};

export const removeSpaceByUnderScore = (str: string) => {
  str = str.trim();
  str = str.replace(/\s\s/g, ' ');
  return str.replace(/\s/g, '_');
};

export const formatPhoneNumberByCountryCode = (phoneNumber: string, country_iso: string) => {
  if (!phoneNumber || !country_iso) return phoneNumber;
  // Parse number with US country code and keep raw input
  const number = phoneUtil.parseAndKeepRawInput(phoneNumber, country_iso);
  return ['+', number.getCountryCode(), phoneNumber.slice(1, phoneNumber.length)].join('');
};

export const enumToArray = (e: any) => {
  return Object.keys(e)
    .map((k) => ({
      key: k,
      value: e[k],
    }))
    .sort((a, b) => a.value - b.value)
    .filter((item) => isNaN(Number(item.key)));
};

export default common;
