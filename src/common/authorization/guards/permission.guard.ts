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
    // OR semantics: the user passes the verb gate if they hold AT LEAST ONE of the
    // required codes (via explicit role grant OR owner-implied scope). Multiple codes
    // on one endpoint mean "any of these capabilities is enough" (e.g. an endpoint
    // shared by the create and update flows accepts either grant).
    let anyExplicit = false;
    let anyImplied = false;

    for (const code of requiredCodes) {
      if (await this.permissionCache.hasPermission(userId, code)) {
        anyExplicit = true;
        continue;
      }
      if (impliedVerbs === null) {
        impliedVerbs = await this.ownerScope.getUserImpliedVerbs(userId);
      }
      if (impliedVerbs.has(code)) {
        anyImplied = true;
      }
    }

    if (!anyExplicit && !anyImplied) {
      throw new ForbiddenException(`Missing required permission: one of [${requiredCodes.join(', ')}]`);
    }

    // Conservative data-scope signal: stay explicit ONLY when the match is purely
    // explicit. If any required verb leaned on the owner-implied path, downstream
    // (OwnerScopeGuard + data-access interceptor) must restrict to owned records to
    // avoid surfacing rows the user can only reach as an owner.
    req.info.verbFromExplicit = anyExplicit && !anyImplied;
    return true;
  }
}
