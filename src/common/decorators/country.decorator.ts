import { getCountryByIp } from '@common/utils';
import { RequestWithInfo } from '@common/types/request-with-info';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CountryScope = createParamDecorator(async (_fieldName: string, context: ExecutionContext) => {
  const req = context.switchToHttp().getRequest<RequestWithInfo>();
  const rs: unknown = await getCountryByIp(req.info?.ip ?? '');
  return rs;
});
