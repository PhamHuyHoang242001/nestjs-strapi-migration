import { BadRequestException, ValidationError } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const i18n = require('../../service/i18n') as {
  default?: { __: (msg: string, replacements: Record<string, unknown>) => string };
  __?: (msg: string, replacements: Record<string, unknown>) => string;
};

export const URL_LINK_INVALID = 'Link $property is invalid';
export const NAME_INVALID = '$property is invalid';
export const EMAIL_INVALID = '$property is invalid';
export const PHONE_INVALID = '$property is invalid';
export const PATTERN_TWITER_REGEX_EXISTED = `Organization((\\s\\S+)+) doesn't exist`;
export const PATTERN_TWITER_REGEX_IN_VALID = `Organization((\\s\\S+)+) is not valid`;

const classValidationPatterns = [
  '$IS_INSTANCE decorator expects and object as value, but got falsy value.',
  '$property is not a valid decimal number.',
  '$property must be a BIC or SWIFT code',
  '$property must be a boolean string',
  '$property must be a boolean value',
  '$property must be a BTC address',
  '$property must be a credit card',
  '$property must be a currency',
  '$property must be a data uri format',
  '$property must be a Date instance',
  '$property must be a Firebase Push Id',
  '$property must be a hash of type (.+)',
  '$property must be a hexadecimal color',
  '$property must be a hexadecimal number',
  '$property must be a HSL color',
  '$property must be a identity card number',
  '$property must be a ISSN',
  '$property must be a json string',
  '$property must be a jwt string',
  '$property must be a latitude string or number',
  '$property must be a latitude,longitude string',
  '$property must be a longitude string or number',
  '$property must be a lowercase string',
  '$property must be a MAC Address',
  '$property must be a mongodb id',
  '$property must be a negative number',
  '$property must be a non-empty object',
  '$property must be a number conforming to the specified constraints',
  '$property must be a number string',
  '$property must be a phone number',
  '$property must be a port',
  '$property must be a positive number',
  '$property must be a postal code',
  '$property must be a Semantic Versioning Specification',
  '$property must be a string',
  '$property must be a valid domain name',
  '$property must be a valid enum value',
  '$property must be a valid ISO 8601 date string',
  '$property must be a valid ISO31661 Alpha2 code',
  '$property must be a valid ISO31661 Alpha3 code',
  '$property must be a valid phone number',
  '$property must be a valid representation of military time in the format HH:MM',
  '$property must be an array',
  '$property must be an EAN (European Article Number)',
  '$property must be an email',
  '$property must be an Ethereum address',
  '$property must be an IBAN',
  '$property must be an instance of (.+)',
  '$property must be an integer number',
  '$property must be an ip address',
  '$property must be an ISBN',
  '$property must be an ISIN (stock/security identifier)',
  '$property must be an ISRC',
  '$property must be an object',
  '$property must be an URL address',
  '$property must be an UUID',
  '$property must be base32 encoded',
  '$property must be base64 encoded',
  '$property must be divisible by (.+)',
  '$property must be empty',
  '$property must be equal to (.+)',
  '$property must be locale',
  '$property must be longer than or equal to (\\S+) and shorter than or equal to (\\S+) characters',
  '$property must be longer than or equal to (\\S+) characters',
  '$property must be magnet uri format',
  '$property must be MIME type format',
  '$property must be one of the following values:((\\s\\S+)+)',
  '$property must be RFC 3339 date',
  '$property must be RGB color',
  '$property must be shorter than or equal to (\\S+) characters',
  '$property must be shorter than or equal to (\\S+) characters',
  '$property must be uppercase',
  '$property must be valid octal number',
  '$property must be valid passport number',
  '$property must contain (\\S+) values',
  '$property must contain a (\\S+) string',
  '$property must contain a full-width and half-width characters',
  '$property must contain a full-width characters',
  '$property must contain a half-width characters',
  '$property must contain any surrogate pairs chars',
  '$property must contain at least (\\S+) elements',
  '$property must contain not more than (\\S+) elements',
  '$property must contain one or more multibyte chars',
  '$property must contain only ASCII characters',
  '$property must contain only letters (a-zA-Z)',
  '$property must contain only letters and numbers',
  '$property must match (\\S+) regular expression',
  '$property must not be greater than (.+)',
  '$property must not be less than (.+)',
  '$property should not be empty',
  '$property should not be equal to (.+)',
  '$property should not be null or undefined',
  '$property should not be one of the following values: (.+)',
  '$property should not contain (\\S+) values',
  '$property should not contain a (\\S+) string',
  "$property's byte length must fall into \\((\\S+), (\\S+)\\) range",
  "All $property's elements must be unique",
  'each value in ',
  'maximal allowed date for $property is (.+)',
  'minimal allowed date for $property is (.+)',
  'nested property $property must be either object or array',
  'each value in nested property $property must be either object or array',
  URL_LINK_INVALID,
  NAME_INVALID,
  EMAIL_INVALID,
  PHONE_INVALID,
];

for (let i = 0, len = classValidationPatterns.length; i < len; i++) {
  classValidationPatterns[i] = classValidationPatterns[i].replace('$', '\\$');
}

/** Extended ValidationError with extra tracking fields added during processing */
interface ValidationErrorWithMeta extends ValidationError {
  validationProperty?: string;
}

/**
 * The class-validator package does not support i18n and thus we will
 * translate the error messages ourselves.
 */
export function validation_Errors_Translate(validationErrors: ValidationError[]) {
  const errors = validationErrors.map((error: ValidationError): string[] => {
    const errorItem = error as ValidationErrorWithMeta;
    errorItem.validationProperty = error.property;
    const errosRecursive = recursiveSearch(errorItem, errorItem.validationProperty, '.');
    if (errorItem.constraints) {
      return parserErrors(errorItem);
    }
    for (let x = 0, l = errosRecursive.length; x < l; x++) {
      const errorRecursive = errosRecursive[x];
      if (errorRecursive.constraints) {
        return parserErrors(errorRecursive);
      }
    }
    return [];
  });

  const errorsFlattened = errors.reduce((data: string[], errs) => {
    data.push(...errs);
    return data;
  }, []);
  const message = errorsFlattened[0];
  return new BadRequestException({
    validation: true,
    message,
  });
}

function parserErrors(error: ValidationErrorWithMeta): string[] {
  const constraints = error.constraints ?? {};
  return Object.keys(constraints).map((key: string): string => {
    let match: RegExpExecArray | null = null;
    let constraint = '';

    for (const validationPattern of classValidationPatterns) {
      constraint = constraints[key].replace(error.property ?? '', '$property');
      match = new RegExp(validationPattern, 'g').exec(constraint);
      if (match) break;
    }

    let msg = constraint;
    const replacements: Record<string, unknown> = { property: error.validationProperty };
    if (match) {
      for (let i = 1; i < match.length; i += 1) {
        msg = msg.replace(match[i], `$constraint${i}`);
        replacements[`constraint${i}`] = match[i];
      }
    }
    const i18nInstance = ((i18n as { default?: { __: (msg: string, replacements: Record<string, unknown>) => string } })
      .default ?? i18n) as { __: (msg: string, replacements: Record<string, unknown>) => string };
    const text = i18nInstance.__(msg, replacements);
    return text;
  });
}

const recursiveSearch = (
  obj: ValidationErrorWithMeta,
  validationProperty: string,
  stringNested = '',
  results: ValidationErrorWithMeta[] = [],
): ValidationErrorWithMeta[] => {
  const r = results;
  const searchKey = 'constraints';
  Object.keys(obj).forEach((key) => {
    const value = (obj as unknown as Record<string, unknown>)[key];
    try {
      if (['children', 'constraints', 'property'].find((u) => u == key)) {
        if (key === searchKey) {
          obj.validationProperty = validationProperty;
          r.push(obj);
        } else if (Array.isArray(value)) {
          for (const item of value as ValidationErrorWithMeta[]) {
            item.validationProperty = item.property || '';
            recursiveSearch(item, `${validationProperty}${stringNested}${item.validationProperty}`, stringNested, r);
          }
        } else if (typeof value === 'object' && value !== null) {
          const child = value as ValidationErrorWithMeta;
          child.validationProperty = child.validationProperty || child.property;
          recursiveSearch(
            child,
            `${validationProperty}${stringNested}${child.validationProperty ?? ''}`,
            stringNested,
            r,
          );
        }
      }
    } catch (error) {
      console.log('error', error);
    }
  });
  return r;
};
