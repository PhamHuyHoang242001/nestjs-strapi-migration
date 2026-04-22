import { RequestWithInfo } from '@common/types/request-with-info';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// user
export const UserScope = createParamDecorator((fieldName: string, context: ExecutionContext) => {
  const req = context.switchToHttp().getRequest<RequestWithInfo>();
  const user = req.info.user;
  return fieldName ? user?.[fieldName] : user;
});
