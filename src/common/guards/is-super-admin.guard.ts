import { RequestWithInfo } from '@common/types/request-with-info';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { UserType } from '@modules/databases/user.entity';

// Only super_admin users (users.type) pass; role permission codes are not enough. Use after BearerGuard.
@Injectable()
export class IsSuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithInfo>();
    if (req.info?.user?.type !== UserType.SUPER_ADMIN) throw new ForbiddenException('Super admin only');
    return true;
  }
}
