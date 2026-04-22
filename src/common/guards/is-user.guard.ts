import { USER_CLIENT } from '@common/enums';
import { RequestWithInfo } from '@common/types/request-with-info';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common/exceptions';

@Injectable()
export class IsUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithInfo>();
    if (!req.info) req.info = {};
    if ((req.info.client as USER_CLIENT) !== USER_CLIENT.USER) throw new ForbiddenException();
    return true;
  }
}
