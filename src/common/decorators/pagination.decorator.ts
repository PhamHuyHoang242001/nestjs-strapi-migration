import { PAGE_DEFAULT, PERPAGE_DEFAULT, PERPAGE_MAXIMUM } from '@constant/index';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';

export interface PaginationParams {
  page: number;
  limit: number;
  skip?: number;
}
export type PaginationInputParams = {
  page?: string;
  limit?: string;
};
export const PaginationDecorator = createParamDecorator(
  (paginationParams: PaginationInputParams, ctx: ExecutionContext) => {
    const pagination = {
      page: 'page',
      limit: 'limit',
      ...paginationParams,
    };
    if (!pagination.page) pagination.page = 'page';
    if (!pagination.limit) pagination.limit = 'limit';

    const request = ctx.switchToHttp().getRequest<Request>();
    const page = Math.max(Number(request.query[pagination.page]), PAGE_DEFAULT) || PAGE_DEFAULT;
    const limit =
      Math.min(Number(request.query[pagination.limit]) || PERPAGE_DEFAULT, PERPAGE_MAXIMUM) || PERPAGE_DEFAULT;
    return {
      skip: (page - 1) * limit,
      page,
      limit,
    };
  },
  [
    (target, key) => {
      const propertyDescriptor = Object.getOwnPropertyDescriptor(target, key);
      if (propertyDescriptor) {
        ApiQuery({
          name: 'page',
          schema: { default: PAGE_DEFAULT, type: 'number', minimum: PAGE_DEFAULT },
          required: false,
        })(target, key, propertyDescriptor);

        ApiQuery({
          name: 'limit',
          schema: { default: PERPAGE_DEFAULT, type: 'number', minimum: 1, maximum: PERPAGE_MAXIMUM },
          required: false,
        })(target, key, propertyDescriptor);
      }
    },
  ],
);
