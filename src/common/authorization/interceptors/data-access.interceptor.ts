import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { RequestWithInfo } from '@common/types/request-with-info';
import { findRootTable } from '@modules/data-access/helpers/owner-scope-helpers';
import { DATA_ACCESS_META_KEY } from '../constants/authorization.constant';
import { DataAccessMeta } from '../decorators/require-data-access.decorator';
import { OwnerScopeResolverService } from '../services/owner-scope-resolver.service';
import { PermissionCacheService } from '../services/permission-cache.service';

/**
 * Builds `req.info.dataScope` from two cached fetches. Downstream services
 * call `applyDataScope(qb, alias, table, scope)` which emits the WHERE predicate.
 *
 * Record visibility:
 *   - verb resolved via role.permissions (or super_admin) → `explicit OR owner_branch`
 *   - verb resolved ONLY via owner-implied path (req.info.verbFromExplicit === false)
 *     → owner_branch only; explicit branch suppressed so an owner-path caller cannot
 *     reach records outside their owned subtree via unrelated admin allow-grants.
 *
 * Owner branch is additive and immune to deny — deny rules only subtract inside
 * `getAccessibleRecords()`.
 */
@Injectable()
export class DataAccessInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionCache: PermissionCacheService,
    private readonly ownerScope: OwnerScopeResolverService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const meta = this.reflector.getAllAndOverride<DataAccessMeta | undefined>(DATA_ACCESS_META_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<RequestWithInfo>();

    const userId = Number(req.info?.user?.id);
    if (!userId) throw new ForbiddenException('User not authenticated');

    const ownerOnlyPath = req.info?.verbFromExplicit === false;

    const rootTable = findRootTable(meta.tableName);
    const [explicit, ownedRootIds] = await Promise.all([
      ownerOnlyPath
        ? Promise.resolve([] as number[])
        : this.permissionCache.getAccessibleRecords(userId, meta.tableName, meta.permissionCode),
      rootTable ? this.ownerScope.getOwnedRoots(userId, rootTable) : Promise.resolve([] as number[]),
    ]);

    req.info.dataScope = {
      explicit,
      ownedRoots: ownedRootIds.length > 0 && rootTable ? { rootTable, rootIds: ownedRootIds } : null,
    };
    return next.handle();
  }
}
