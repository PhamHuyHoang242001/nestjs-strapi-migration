import { RequestWithInfo } from '@common/types/request-with-info';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// get token request
export const HeaderScope = createParamDecorator((fieldName: string, context: ExecutionContext) => {
  const req = context.switchToHttp().getRequest<RequestWithInfo>();
  return fieldName ? req.info[fieldName] : req.info;
});
