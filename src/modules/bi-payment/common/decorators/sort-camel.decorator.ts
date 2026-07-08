import { SortType } from '@common/enums';
import { i18nMsg, toSnakeKey } from '@common/utils';
import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';

// bi-payment sort query — Strapi parity: camelCase keys (sortField/sortValue).
// Maps nội bộ sang snake_case { sort_field, sort_order } như common Sort, ko lan tỏa module khác.
export interface SortCamelInputParams {
  allowedFields?: string[];
  default?: {
    sortField?: string;
    sortValue?: string;
  };
}

export type SortCamelParams = {
  sort_field: string;
  sort_order: SortType.ASC | SortType.DESC;
};

const sortTypeList = [SortType.DESC, SortType.ASC];

// Method decorator wrapper — wraps createParamDecorator, mirrors common Sort structure
// but reads camelCase query keys.
export const SortCamel = (sortParams: SortCamelInputParams) => {
  return (target: object, key: string | symbol, descriptorOrIndex: PropertyDescriptor | number) => {
    const propertyDescriptor =
      typeof descriptorOrIndex === 'number' ? undefined : Object.getOwnPropertyDescriptor(target, key);

    if (propertyDescriptor) {
      ApiQuery({
        name: 'sortField',
        enum: sortParams.allowedFields || [],
        schema: { default: sortParams.default?.sortField || 'id', type: 'string' },
        required: false,
      })(target, key, propertyDescriptor);

      ApiQuery({
        name: 'sortValue',
        schema: { default: sortParams.default?.sortValue || SortType.DESC, type: 'string' },
        enum: sortTypeList,
        required: false,
      })(target, key, propertyDescriptor);
    }

    if (typeof descriptorOrIndex === 'number') {
      return sortCamelDecorator(sortParams)(target, key, descriptorOrIndex);
    }
  };
};

const sortCamelDecorator = createParamDecorator((sortInput: SortCamelInputParams, ctx: ExecutionContext) => {
  const sortParams = { ...sortInput };

  const request = ctx.switchToHttp().getRequest<Request>();
  // Strapi camelCase query keys.
  const rawField = request.query['sortField'];
  const rawOrder = request.query['sortValue'];

  // Map camelCase field → snake_case (entity column), fallback default.
  const sort_field: string = toSnakeKey(
    (typeof rawField === 'string' ? rawField : sortParams.default?.sortField) || 'id',
  ) as string;
  const sort_order: string = (
    (typeof rawOrder === 'string' ? rawOrder : sortParams.default?.sortValue) || SortType.DESC
  ).toUpperCase();

  // Validate allowedFields against the SNAKE_CASE form (caller passes camelCase allowedFields,
  // convert before compare so both forms match the resolved sort_field).
  const allowedSnake = (sortParams.allowedFields || []).map((f) => toSnakeKey(f) as string);
  if (!allowedSnake.length || (sort_field !== 'id' && !allowedSnake.includes(sort_field))) {
    throw new BadRequestException({
      message: i18nMsg('$property must be one of the following values:$constraint1', {
        property: 'sortField',
        constraint1: sortParams.allowedFields,
      }),
      validation: true,
    });
  }

  if (!sortTypeList.includes(sort_order as SortType)) {
    throw new BadRequestException({
      message: i18nMsg('$property must be one of the following values:$constraint1', {
        property: 'sortValue',
        constraint1: sortTypeList,
      }),
      validation: true,
    });
  }

  return {
    sort_field,
    sort_order,
  } as SortCamelParams;
});
