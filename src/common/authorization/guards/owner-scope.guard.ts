import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestWithInfo } from '@common/types/request-with-info';
import { OWNER_SCOPE_META_KEY } from '../constants/authorization.constant';
import { OwnerScopeMeta } from '../decorators/require-owner-scope.decorator';
import { OwnerScopeResolverService } from '../services/owner-scope-resolver.service';

/**
 * Write-side enforcement. Runs AFTER PermissionGuard which sets
 * `req.info.verbFromExplicit`:
 *   true  → caller holds every required verb via role.permissions (or super_admin).
 *           OwnerScopeGuard bypasses ownership check — record-level access remains
 *           constrained by dataScope.explicit at the service layer.
 *   false → caller resolved at least one verb via SO implied path. Enforce
 *           isInOwnedScope so the user stays within their owned subtree.
 *   undefined → endpoint has @RequireOwnerScope without @RequirePermission. Falls
 *           back to ownership check + warn (decorator misuse).
 *
 * If meta is missing, this guard is a no-op.
 *
 * Guard order (per plan Red Team H6):
 *   JwtAuthGuard → PermissionGuard → OwnerScopeGuard → DataAccessInterceptor
 */
@Injectable()
export class OwnerScopeGuard implements CanActivate {
  private readonly logger = new Logger(OwnerScopeGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly ownerScope: OwnerScopeResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<OwnerScopeMeta | undefined>(OWNER_SCOPE_META_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!meta) return true;

    const req = context.switchToHttp().getRequest<RequestWithInfo & { body?: Record<string, unknown>; params?: Record<string, unknown> }>();

    // Explicit-verb bypass: caller cleared PermissionGuard via role.permissions only
    // (or super_admin). Owner-scope check would falsely block legitimate non-SO writes.
    if (req.info?.verbFromExplicit === true) return true;

    if (req.info?.verbFromExplicit === undefined) {
      this.logger.warn(
        `@RequireOwnerScope on ${meta.table} but verbFromExplicit is unset; ` +
          `endpoint likely missing @RequirePermission. Falling back to owned-scope check.`,
      );
    }

    const userId = Number(req.info?.user?.id);
    if (!userId) throw new ForbiddenException('User not authenticated');

    const targetId = this.resolveTargetId(req, meta);
    if (!targetId || !Number.isFinite(targetId)) {
      throw new ForbiddenException(`Missing target id for owner-scope check on ${meta.table}`);
    }

    const owned = await this.ownerScope.isInOwnedScope(userId, meta.table, targetId);
    if (!owned) throw new ForbiddenException(`Out of owner scope for ${meta.table}/${targetId}`);

    return true;
  }

  private resolveTargetId(
    req: { body?: Record<string, unknown>; params?: Record<string, unknown> },
    meta: OwnerScopeMeta,
  ): number {
    if (meta.scopeFromBody) {
      const raw = req.body?.[meta.scopeFromBody];
      return Number(raw);
    }
    if (meta.scopeFromParam) {
      const raw = req.params?.[meta.scopeFromParam];
      return Number(raw);
    }
    throw new ForbiddenException('OwnerScope meta missing scopeFromBody/scopeFromParam');
  }
}
