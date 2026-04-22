import { SortType } from '@common/enums';
import { i18nMsg, toSnakeKey } from '@common/utils';
import { BadRequestException, ExecutionContext, createParamDecorator } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';

export type SortParams = {
  sort_field: string;
  sort_order: SortType.ASC | SortType.DESC;
};

export type SortInputParams = {
  allowedFields?: string[];
  sort_field?: string;
  sort_order?: string;
  default?: {
    sort_field?: string;
    sort_order?: string;
  };
};

const sortType = [SortType.DESC, SortType.ASC];

export function Sort(sortParams: SortInputParams) {
  return (target: object, key: string | symbol, descriptorOrIndex: PropertyDescriptor | number) => {
    const propertyDescriptor = Object.getOwnPropertyDescriptor(target, key);
    if (propertyDescriptor) {
      ApiQuery({
        name: 'sort_field',
        enum: sortParams.allowedFields || [],
        schema: {
          default: sortParams.default?.sort_field || 'id',
          type: 'string',
        },
        required: false,
      })(target, key, propertyDescriptor);

      ApiQuery({
        name: 'sort_order',
        schema: {
          default: sortParams.default?.sort_order || SortType.DESC,
          type: 'string',
        },
        enum: sortType,
        required: false,
      })(target, key, propertyDescriptor);
    }

    // Support both parameter decorator (number) and method decorator (PropertyDescriptor)
    if (typeof descriptorOrIndex === 'number') {
      return sortDecorator(sortParams)(target, key, descriptorOrIndex);
    }
  };
}

const sortDecorator = createParamDecorator((sortInput: SortInputParams, ctx: ExecutionContext) => {
  const sortParams: SortInputParams & { sort_field: string; sort_order: string } = {
    sort_field: 'sort_field',
    sort_order: 'sort_order',
    ...sortInput,
  };

  if (!sortParams.sort_field) sortParams.sort_field = 'sort_field';
  if (!sortParams.sort_order) sortParams.sort_order = 'sort_order';

  const request = ctx.switchToHttp().getRequest<Request>();
  const rawField = request.query[sortParams.sort_field];
  const rawOrder = request.query[sortParams.sort_order];

  const sort_field: string = toSnakeKey(
    (typeof rawField === 'string' ? rawField : sortParams.default?.sort_field) || 'id',
  ) as string;
  const sort_order: string = (
    (typeof rawOrder === 'string' ? rawOrder : sortParams.default?.sort_order) || SortType.DESC
  ).toUpperCase();

  if (!sortParams.allowedFields || (sort_field !== 'id' && !sortParams.allowedFields.includes(sort_field))) {
    throw new BadRequestException({
      message: i18nMsg('$property must be one of the following values:$constraint1', {
        property: sortParams.sort_field,
        constraint1: sortParams.allowedFields,
      }),
      validation: true,
    });
  }

  if (!sortType.includes(sort_order as SortType)) {
    throw new BadRequestException({
      message: i18nMsg('$property must be one of the following values:$constraint1', {
        property: sortParams.sort_order,
        constraint1: sortType,
      }),
      validation: true,
    });
  }
  return {
    sort_field,
    sort_order,
  };
});
