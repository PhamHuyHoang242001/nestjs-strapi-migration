import { ForbiddenException, Injectable } from '@nestjs/common';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import { PermissionCacheService } from '@common/authorization/services/permission-cache.service';
import { MaToolWorkstepType } from '@common/enums/ma-tool.enums';
import {
  ALL_WORKSTEP_TYPES,
  OWN_ONLY_CODES,
  PROGRAM_CONTENT_VIEW_CODE,
  WORKSTEP_VIEW_CODES,
} from './step-scope.constants';

// Table whose data_access rules scope program visibility.
const PROGRAM_TABLE = 'bi_payment_programs';

// Per-workstep access scope under the 8-permission model. `own: true` means the
// user may only see documents they created (uploaded_by_id = self) for that
// workstep; `own: false` means full visibility of every document in the step.
export interface WorkstepScope {
  own: boolean;
}

/**
 * Per-program + per-workstep permission resolution for bi-payment content endpoints.
 *
 * SO owner of a bicc department → owns every program under it → all worksteps.
 * Role / user-exception → a step code is effective only at programs the user has
 * a data_access rule for (role_data_access or data_access_users carrying that code).
 *
 * Reuses existing plumbing:
 *  - ownerScope.isInOwnedScope(userId, 'bi_payment_programs', programId) walks
 *    program→project→bicc_department with soft-delete guards (no custom join).
 *  - permissionCache.getAccessibleRecords(userId, table, code) returns the
 *    program ids the user may act on under that code (role ∪ user allow, deny
 *    subtracted upstream). Cached per-code, so multiple codes = distinct keys.
 */
@Injectable()
export class StepScopeService {
  constructor(
    private readonly permCache: PermissionCacheService,
    private readonly ownerScope: OwnerScopeResolverService,
  ) {}

  // Set of workstep_type values the user may view at `programId`.
  // Throws ForbiddenException when the user holds no step code at the program
  // and is not an SO owner (i.e. the program is out of scope).
  async resolveAllowedWorksteps(userId: number, programId: number): Promise<Set<MaToolWorkstepType>> {
    const allowed = new Set((await this.resolveWorkstepScopes(userId, programId)).keys());
    if (allowed.size === 0) throw new ForbiddenException('No permission for program');
    return allowed;
  }

  // Gate a specific workstepType at a program. Throws if the user lacks the
  // code mapped to that workstep at the program (or is out of scope entirely).
  async assertWorkstep(userId: number, programId: number, workstepType: MaToolWorkstepType): Promise<void> {
    const allowed = await this.resolveAllowedWorksteps(userId, programId);
    if (!allowed.has(workstepType)) {
      throw new ForbiddenException('No permission for workstep');
    }
  }

  // Global (non-program) viewable workstep set — a workstep is viewable if the
  // user holds any code granting view on it, regardless of program. Used by
  // cross-program endpoints (user-created/updated docs) that cannot pin a
  // single program. Super-admin / SO semantics are not applied here: this only
  // reflects role.permissions + user-exception codes.
  async resolveGlobalViewableWorksteps(userId: number): Promise<MaToolWorkstepType[]> {
    return [...(await this.resolveGlobalWorkstepScopes(userId)).keys()];
  }

  // Program-scoped capability check for flows whose verb must stay independent
  // from document/template view maps (template lifecycle, upload, merge, status).
  // SO ownership remains per-program and explicit data-access grants remain
  // permission-code specific.
  async hasProgramCapability(userId: number, programId: number, code: string): Promise<boolean> {
    if (await this.ownerScope.isInOwnedScope(userId, PROGRAM_TABLE, programId)) return true;
    const ids = await this.permCache.getAccessibleRecords(userId, PROGRAM_TABLE, code);
    return ids.includes(programId);
  }

  // ── 8-permission model (own-aware) ─────────────────────────────────────────

  // Per-workstep access scope for `userId` at `programId` under the new model.
  // SO owner → every workstep, full-view. Otherwise a workstep is included when
  // the user holds any WORKSTEP_VIEW_CODES code for it at the program; `own` is
  // false as soon as one held code is NOT own-only (full-view wins), else true.
  // Worksteps the user cannot see are absent from the map (empty map = no
  // document access; callers decide throw vs empty).
  async resolveWorkstepScopes(userId: number, programId: number): Promise<Map<MaToolWorkstepType, WorkstepScope>> {
    const scopes = new Map<MaToolWorkstepType, WorkstepScope>();

    // SO own-all is per-program: an owner of program A gets nothing extra at B.
    const isOwner = await this.ownerScope.isInOwnedScope(userId, PROGRAM_TABLE, programId);
    if (isOwner) {
      for (const ws of ALL_WORKSTEP_TYPES) scopes.set(ws, { own: false });
      return scopes;
    }

    // Read-only full-content grant: same all-worksteps full-view as an SO owner,
    // but earned via an explicit per-program data_access grant of the code.
    const contentViewIds = await this.permCache.getAccessibleRecords(userId, PROGRAM_TABLE, PROGRAM_CONTENT_VIEW_CODE);
    if (contentViewIds.includes(programId)) {
      for (const ws of ALL_WORKSTEP_TYPES) scopes.set(ws, { own: false });
      return scopes;
    }

    // Sale chỉ có upload_recon: RECON_DATA vào đây hasOwn=true, hasFull=false
    // → scopes.set(RECON_DATA, { own: true }). SQL list lọc uploaded_by_id.
    for (const ws of Object.keys(WORKSTEP_VIEW_CODES) as MaToolWorkstepType[]) {
      let hasFull = false;
      let hasOwn = false;
      for (const code of WORKSTEP_VIEW_CODES[ws]) {
        const ids = await this.permCache.getAccessibleRecords(userId, PROGRAM_TABLE, code);
        if (!ids.includes(programId)) continue;
        if (OWN_ONLY_CODES.has(code)) hasOwn = true;
        else hasFull = true;
      }
      if (hasFull) scopes.set(ws, { own: false });
      else if (hasOwn) scopes.set(ws, { own: true });
    }
    return scopes;
  }

  // Same as resolveWorkstepScopes but callers that must degrade gracefully
  // (e.g. list endpoints returning an empty page for view-only users instead of
  // 403) use the map size to branch. Kept as a named method so the empty-vs-throw
  // contract is explicit at call sites rather than swallowing exceptions.
  async resolveWorkstepScopesOrEmpty(
    userId: number,
    programId: number,
  ): Promise<Map<MaToolWorkstepType, WorkstepScope>> {
    return this.resolveWorkstepScopes(userId, programId);
  }

  // Cross-program own-aware workstep scopes (no single program to pin). A
  // workstep is present when the user holds any view code for it globally; `own`
  // is true when every held code for it is own-only. Used by user-created /
  // user-updated document enumerations so an own-only recon uploader only ever
  // surfaces their own contributions, not colleagues' identities.
  async resolveGlobalWorkstepScopes(userId: number): Promise<Map<MaToolWorkstepType, WorkstepScope>> {
    const perms = await this.permCache.getPermissions(userId);
    const scopes = new Map<MaToolWorkstepType, WorkstepScope>();

    // Holding the read-only full-content code anywhere surfaces every workstep
    // full-view for cross-program enumerations (mirrors the upload full path).
    if (perms.has(PROGRAM_CONTENT_VIEW_CODE)) {
      for (const ws of ALL_WORKSTEP_TYPES) scopes.set(ws, { own: false });
      return scopes;
    }

    for (const ws of Object.keys(WORKSTEP_VIEW_CODES) as MaToolWorkstepType[]) {
      let hasFull = false;
      let hasOwn = false;
      for (const code of WORKSTEP_VIEW_CODES[ws]) {
        if (!perms.has(code)) continue;
        if (OWN_ONLY_CODES.has(code)) hasOwn = true;
        else hasFull = true;
      }
      if (hasFull) scopes.set(ws, { own: false });
      else if (hasOwn) scopes.set(ws, { own: true });
    }
    return scopes;
  }
}
