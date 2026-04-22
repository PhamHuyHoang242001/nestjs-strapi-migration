import { USER_CLIENT } from '@common/enums';
import { RequestWithInfo } from '@common/types/request-with-info';
import { YOU_MUST_BE_ADMIN } from '@constant/error-messages';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common/exceptions';

@Injectable()
export class IsAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithInfo>();
    if (!req.info) req.info = {};
    if ((req.info.client as USER_CLIENT) !== USER_CLIENT.ADMIN) throw new ForbiddenException(YOU_MUST_BE_ADMIN);
    return true;
  }
}
