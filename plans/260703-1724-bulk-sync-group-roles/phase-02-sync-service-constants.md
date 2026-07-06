---
phase: 2
title: Sync Service & Constants
status: completed
priority: P1
effort: 5h
dependencies:
  - 1
---

# Phase 2: Sync Service & Constants

## Overview
Core logic: a dedicated service that reads `group_role_mappings`, groups by `group_role`, resolves permissions + users, creates/updates roles, assigns users, and returns a JSON report. Kept in a **new file** because `role.service.ts` is already 543 lines.

## Requirements
- Functional:
  - Read all `group_role_mappings` where `deleted_at IS NULL`.
  - Resolve fixed permission codes → permission ids; collect missing codes.
  - Group rows by `group_role`; per group resolve users by derived email.
  - Role missing → create (name=group_role, code=null, user_id=caller, attach perms). Role exists → add-only permission sync + keep.
  - Assign users (insert only non-existing → skip duplicates). Missing users collected per group.
  - Return structured report.
- Non-functional: reuse existing repos/patterns; invalidate permission cache for newly-added users; best-effort (no global transaction).

## Architecture
- New constant file `src/modules/role/constants/group-role-sync.constants.ts`:
  ```ts
  export const GROUP_ROLE_PERMISSION_CODES: string[] = [
    'bh_report_view',
    // TODO: user fills real codes here
  ];
  export const GROUP_ROLE_EMAIL_DOMAIN = '@vpbank.com.vn';
  ```
- New service `src/modules/role/group-role-sync.service.ts` → `GroupRoleSyncService.syncGroupRoles(caller: Users)`.
- Dependencies injected: `DataSource` (raw query + repos), `PermissionRepository` (resolve codes), `UserRepository` (lookup by email), `RoleRepository` (find/create role), `PermissionCacheService` (invalidate). Reuse patterns from `role.service.ts` (`assignUsers`, `create`).
- Super_admin gate is enforced here too as defense-in-depth: throw `ForbiddenException` if `caller.type !== UserType.SUPER_ADMIN` (primary gate is controller-level, but service check keeps it safe if reused).

## Data Flow
1. Guard: `if (caller.type !== UserType.SUPER_ADMIN) throw new ForbiddenException(...)`.
2. `permissions = permissionRepository.find({ where: { code: In(CODES) } })` → map code→id. `missingPermissionCodes = CODES - found.codes`.
3. `rows = dataSource.getRepository(GroupRoleMapping).find({ where: { deleted_at: IsNull() } })` (or `is_deleted: false`). Group into `Map<group_role, Set<email_user>>`.
4. For each `[group_role, emailUsers]`:
   a. `emails = [...emailUsers].map(e => e.toLowerCase() + GROUP_ROLE_EMAIL_DOMAIN)`.
   b. `users = userRepository.find({ where: { email: In(emails) } })`. `usersNotFound = emails - users.email`.
   c. `role = roleRepository.findOneByCondition({ name: group_role })`.
      - Not found → `roleRepository.save({ name: group_role, user_id: caller.id, permissions: permIds.map(id => ({id})) })`. `created=true`.
      - Found → **add-only sync**: compute perm ids not yet in `roles_permissions` for this role; `INSERT ... ON CONFLICT DO NOTHING` (or check-then-insert) into `roles_permissions`. Never delete existing. `created=false`.
   d. Assign users: replicate `assignUsers` insert-non-existing pattern via `UserRole` repo → find existing `role_id+user_id IN`, insert the rest. Track `usersAdded`, `usersSkippedExisting`.
   e. Invalidate permission cache for each added user id (`permissionCache.invalidateUser(id).catch(()=>{})`).
   f. Push per-role report entry.
5. Return aggregated report.

## Report Shape
```ts
{
  summary: { rolesCreated, rolesUpdated, usersAssigned, usersSkippedExisting },
  missingPermissionCodes: string[],
  roles: Array<{
    group_role: string;
    roleId: number;
    created: boolean;
    usersAdded: number;
    usersSkippedExisting: number;
    usersNotFound: string[];   // derived emails not matched
  }>,
}
```

## Related Code Files
- Create: `src/modules/role/constants/group-role-sync.constants.ts`
- Create: `src/modules/role/group-role-sync.service.ts` (keep < 200 lines; extract helpers if needed)
- Read for pattern: `src/modules/role/role.service.ts` (`create`, `assignUsers`), `src/modules/databases/user-role.entity.ts`, `src/modules/databases/role.entity.ts` (`ROLE_PERMISSION` join table name `roles_permissions`).

## Implementation Steps
1. Add constant file with placeholder codes + domain.
2. Implement `GroupRoleSyncService` with constructor injection listed above.
3. Implement grouping + resolve + per-group create/update/assign + report.
4. For existing-role add-only sync, use the `ROLE_PERMISSION` (`roles_permissions`) join table directly with `INSERT ... ON CONFLICT DO NOTHING` to avoid TypeORM cascade removing rows.
5. Guard against empty `GROUP_ROLE_PERMISSION_CODES` (skip perm attach gracefully, still create roles + assign users).
6. `npm run build` to verify types.

## Success Criteria
- [ ] Service compiles; file < 200 lines (extract helpers if over).
- [ ] Grouping by `group_role` produces 1 role per group with all mapped users.
- [ ] Existing role keeps prior permissions AND gains missing fixed permissions (add-only, verified by re-run not deleting).
- [ ] Duplicate users skipped; missing users + missing codes surfaced in report.
- [ ] Permission cache invalidated for added users.

## Risk Assessment
- TypeORM cascade on `role.save({permissions})` could REMOVE existing permissions for existing roles. Mitigation: for existing roles use raw `roles_permissions` insert, never `save` the permissions relation.
- Large mappings table → N+1 user/role lookups. Mitigation: batch `In()` per group; acceptable for expected data size (YAGNI on further optimization).
- `email` column not unique / duplicates → multiple user rows per email. Mitigation: dedupe by user id before assigning.
