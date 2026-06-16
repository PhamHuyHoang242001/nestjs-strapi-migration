import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestWithInfo } from '@common/types/request-with-info';
import { UserType } from '@modules/databases/user.entity';
import { PERMISSION_META_KEY } from '../constants/authorization.constant';
import { OwnerScopeResolverService } from '../services/owner-scope-resolver.service';
import { PermissionCacheService } from '../services/permission-cache.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionCache: PermissionCacheService,
    private readonly ownerScope: OwnerScopeResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredCodes = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSION_META_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredCodes?.length) return true;

    const req = context.switchToHttp().getRequest<RequestWithInfo>();
    // Super admin (users.type === 'super_admin') bypasses verb gate. Treated as
    // explicit path so OwnerScopeGuard (which reads verbFromExplicit) also bypasses.
    if (req.info?.user?.type === UserType.SUPER_ADMIN) {
      req.info.verbFromExplicit = true;
      return true;
    }

    const userId = Number(req.info?.user?.id);
    if (!userId) throw new ForbiddenException('User not authenticated');

    // Lazy-resolve impliedVerbs only when an explicit role permission is missing.
    // Avoids unnecessary cache/SQL roundtrip for the common admin/role-permission path.
    let impliedVerbs: Set<string> | null = null;
    // Track whether any required verb resolved via SO implied path. If yes, the
    // request is NOT pure-explicit and OwnerScopeGuard must still enforce ownership.
    let resolvedViaImplied = false;

    for (const code of requiredCodes) {
      if (await this.permissionCache.hasPermission(userId, code)) continue;

      if (impliedVerbs === null) {
        impliedVerbs = await this.ownerScope.getUserImpliedVerbs(userId);
      }
      if (!impliedVerbs.has(code)) {
        throw new ForbiddenException(`Missing required permission: ${code}`);
      }
      resolvedViaImplied = true;
    }

    req.info.verbFromExplicit = !resolvedViaImplied;
    return true;
  }
}
