import { ForbiddenException, Injectable } from '@nestjs/common';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import { PermissionCacheService } from '@common/authorization/services/permission-cache.service';
import { MaToolWorkstepType } from '@common/enums/ma-tool.enums';
import { ALL_WORKSTEP_TYPES, WORKSTEP_TYPE_PERM, viewCodesForWorkstep } from './step-scope.constants';

// Table whose data_access rules scope program visibility.
const PROGRAM_TABLE = 'bi_payment_programs';

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
    // SO own-all: helper already walks the hierarchy + enforces soft-delete.
    const isOwner = await this.ownerScope.isInOwnedScope(userId, PROGRAM_TABLE, programId);
    if (isOwner) return new Set(ALL_WORKSTEP_TYPES);

    const allowed = new Set<MaToolWorkstepType>();
    for (const wsType of Object.keys(WORKSTEP_TYPE_PERM) as MaToolWorkstepType[]) {
      // A workstep is viewable if the user holds ANY code that grants view on it:
      // its primary gate code OR a bonus code (e.g. bicc also views recon_data).
      for (const code of viewCodesForWorkstep(wsType)) {
        const ids = await this.permCache.getAccessibleRecords(userId, PROGRAM_TABLE, code);
        if (ids.includes(programId)) {
          allowed.add(wsType);
          break;
        }
      }
    }
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
    const perms = await this.permCache.getPermissions(userId);
    return (Object.keys(WORKSTEP_TYPE_PERM) as MaToolWorkstepType[]).filter((wt) =>
      viewCodesForWorkstep(wt).some((code) => perms.has(code)),
    );
  }
}
