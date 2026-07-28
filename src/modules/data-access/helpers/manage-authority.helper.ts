import { PermissionCacheService } from '@common/authorization';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import { PermissionQueryService } from '@common/authorization/services/permission-query.service';
import { Module as ModuleEntity } from '@modules/databases/module.entity';
import { Permission } from '@modules/databases/permission.entity';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

/**
 * Namespace-safe caller identity for the manage-authority gate.
 *
 * `userId` is trusted ONLY when it comes from the user client (BearerGuard resolves
 * `req.info.user.id` from the users table for client='user', but from the admins table
 * for client='admin' — different id namespaces). For any non-user client or a missing/invalid
 * id, `userId` is left undefined so the gate never resolves accessible records against the
 * wrong namespace. `isSuperAdmin` is resolved from the users row by each DataAccessService
 * method's inline caller block (via `checkSuperAdmin`) — source of truth, not the token object.
 */
export interface CallerContext {
  userId?: number;
  // Optional so an internal/legacy caller that omits it fails closed (treated as
  // non-super), never escalated. The service's caller block always sets it explicitly.
  isSuperAdmin?: boolean;
  client?: string;
}

/** Actions that constitute an edit grant on a record (drives EDIT_CODE resolution). */
const EDIT_ACTION = 'update';

/**
 * Resolves whether a caller may manage grants on a specific record.
 *
 * canManageRecord = super_admin OR SO(owned-scope) OR (editOnRecord ∧ caller holds verbCode).
 *
 * editOnRecord = the record is in the caller's accessible set for the module's edit
 * permission (action='update'). The verb (e.g. perm_data_access_create / _view) is the
 * separate admin-granted control that decides who may act on records they can edit.
 */
@Injectable()
export class ManageAuthorityService {
  private readonly logger = new Logger(ManageAuthorityService.name);

  constructor(
    private readonly permissionCache: PermissionCacheService,
    private readonly queryService: PermissionQueryService,
    private readonly ownerScope: OwnerScopeResolverService,
    @InjectRepository(ModuleEntity)
    private readonly moduleRepo: Repository<ModuleEntity>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  /**
   * @param opts.bypassCache Read ownership + verb straight from the DB (no 120s cache).
   *   Required for write-authorization so an owner just granted edit is not 403'd by a
   *   stale cache entry; read/list gates may keep the cached path.
   */
  async canManageRecord(
    caller: CallerContext,
    tableName: string,
    recordId: number,
    verbCode: string,
    opts: { bypassCache?: boolean } = {},
  ): Promise<boolean> {
    if (caller.isSuperAdmin) return true;

    // Fail-closed: without a trusted user id we can neither resolve owned scope nor
    // accessible records — and must never query getAccessibleRecords(undefined, ...).
    if (caller.userId === undefined) return false;
    const userId = caller.userId;

    // SO of the record owns it outright — deny-immune, verb-independent.
    if (await this.ownerScope.isInOwnedScope(userId, tableName, recordId)) return true;

    const editCode = await this.resolveEditCode(tableName);
    if (!editCode) {
      this.logger.warn(`canManageRecord: no edit permission (action='${EDIT_ACTION}') for table "${tableName}"`);
      return false;
    }

    const bypass = opts.bypassCache === true;
    const [accessible, hasVerb] = await Promise.all([
      bypass
        ? this.queryService.getAccessibleRecords(userId, tableName, editCode)
        : this.permissionCache.getAccessibleRecords(userId, tableName, editCode),
      bypass ? this.queryService.hasPermission(userId, verbCode) : this.permissionCache.hasPermission(userId, verbCode),
    ]);

    return hasVerb && accessible.includes(recordId);
  }

  /**
   * Records (from `recordIds`) the caller may manage for `verbCode`. Batched so
   * the list/browser scope path resolves ownership once per table instead of per record.
   * super_admin/SO records short-circuit; the remainder is filtered by editOnRecord ∧ verb.
   */
  async filterManageableRecords(
    caller: CallerContext,
    tableName: string,
    recordIds: number[],
    verbCode: string,
    opts: { bypassCache?: boolean } = {},
  ): Promise<number[]> {
    if (!recordIds.length) return [];
    if (caller.isSuperAdmin) return [...recordIds];
    if (caller.userId === undefined) return [];
    const userId = caller.userId;

    const bypass = opts.bypassCache === true;
    const hasVerb = bypass
      ? await this.queryService.hasPermission(userId, verbCode)
      : await this.permissionCache.hasPermission(userId, verbCode);

    const editCode = await this.resolveEditCode(tableName);
    const editable =
      hasVerb && editCode
        ? new Set(
            bypass
              ? await this.queryService.getAccessibleRecords(userId, tableName, editCode)
              : await this.permissionCache.getAccessibleRecords(userId, tableName, editCode),
          )
        : new Set<number>();

    const result: number[] = [];
    for (const id of recordIds) {
      if (editable.has(id) || (await this.ownerScope.isInOwnedScope(userId, tableName, id))) {
        result.push(id);
      }
    }
    return result;
  }

  /**
   * Record ids on `tableName` the caller reaches via a record-scoped edit grant,
   * gated on holding `verbCode`. This is the additive read-scope source for the list +
   * records-browser gates: SO-owned records are surfaced through the caller's existing
   * owner-scope path, so they are intentionally NOT included here. Returns [] when the
   * caller lacks the verb, has no trusted id, or the module has no edit permission.
   */
  async getEditAccessibleRecordIds(
    caller: CallerContext,
    tableName: string,
    verbCode: string,
    opts: { bypassCache?: boolean } = {},
  ): Promise<number[]> {
    if (caller.userId === undefined) return [];
    const userId = caller.userId;
    const bypass = opts.bypassCache === true;

    const hasVerb =
      caller.isSuperAdmin ||
      (bypass
        ? await this.queryService.hasPermission(userId, verbCode)
        : await this.permissionCache.hasPermission(userId, verbCode));
    if (!hasVerb) return [];

    const editCode = await this.resolveEditCode(tableName);
    if (!editCode) return [];

    return bypass
      ? this.queryService.getAccessibleRecords(userId, tableName, editCode)
      : this.permissionCache.getAccessibleRecords(userId, tableName, editCode);
  }

  /** Resolve the module's edit permission code (action='update'); null when none. */
  private async resolveEditCode(tableName: string): Promise<string | null> {
    const mod = await this.moduleRepo.findOne({
      where: { table_name: tableName, is_active: true, deleted_at: IsNull() },
    });
    if (!mod) return null;
    const perm = await this.permissionRepo.findOne({
      where: { module_id: mod.id, action: EDIT_ACTION, is_active: true, deleted_at: IsNull() },
    });
    return perm?.code ?? null;
  }
}
