import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestWithInfo } from '@common/types/request-with-info';
import { PERMISSION_META_KEY } from '../constants/authorization.constant';
import { PermissionCacheService } from '../services/permission-cache.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredCodes = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSION_META_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredCodes?.length) return true;

    const req = context.switchToHttp().getRequest<RequestWithInfo>();
    if (req.info?.client === 'admin') return true;

    const userId = Number(req.info?.user?.id);
    if (!userId) throw new ForbiddenException('User not authenticated');

    for (const code of requiredCodes) {
      if (!(await this.permissionCache.hasPermission(userId, code))) {
        throw new ForbiddenException(`Missing required permission: ${code}`);
      }
    }

    return true;
  }
}
