---
phase: 3
title: API Endpoint & Wiring
status: completed
priority: P1
effort: 2h
dependencies:
  - 2
---

# Phase 3: API Endpoint & Wiring

## Overview
Expose `POST v1/role/sync-group-roles` on the existing `RoleController`, gated to super_admin via inline check, and register the new service + entity in `RoleModule`.

## Requirements
- Functional: authenticated super_admin calls the endpoint → runs sync → gets JSON report. Non-super_admin → 403.
- Non-functional: reuse existing controller guards; no new guard class (per decision).

## Architecture
- Endpoint on `src/modules/role/role.controller.ts`. Controller already has `@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard)`.
  - Do **NOT** add `@RequirePermission` → `PermissionGuard` early-returns `true` when no required codes (`if (!requiredCodes?.length) return true;`), so any authenticated user passes the guard. The super_admin restriction is enforced in the service (Phase 2 guard) — call it with the resolved caller.
  - Grab caller via `@UserScope() user: Users` (pattern already used by `create`, `clone`).
- Wiring in `src/modules/role/role.module.ts`:
  - Add `GroupRoleMapping` to `TypeOrmModule.forFeature([...])`.
  - Add `GroupRoleSyncService` to `providers`. `PermissionCacheService` — confirm it is already provided/exported by an imported module (it's used by `RoleService` via `PermissionCacheService` import; check how RoleService gets it — it's a constructor dep, so it must be resolvable). If `RoleService` already injects `PermissionCacheService`, the provider is available in this module's context; reuse the same import.

## Related Code Files
- Modify: `src/modules/role/role.controller.ts` (add endpoint + inject service)
- Modify: `src/modules/role/role.module.ts` (register entity + service)
- Read for pattern: existing `create`/`clone` handlers in the controller; `@UserScope` decorator from `@common/decorators`.

## Implementation Steps
1. In `RoleModule`, import `GroupRoleMapping`, `GroupRoleSyncService`; add entity to `forFeature`, service to `providers`. Verify `PermissionCacheService`, `PermissionRepository`, `UserRepository`, `RoleRepository` are all resolvable in module scope (RoleService already depends on them → they are).
2. In `RoleController`, inject `private readonly groupRoleSyncService: GroupRoleSyncService`.
3. Add handler:
   ```ts
   @ApiOperation({ summary: 'Bulk sync roles + users from group_role_mappings (super_admin only)' })
   @Post('sync-group-roles')
   @HttpCode(200)
   async syncGroupRoles(@UserScope() user: Users) {
     return this.groupRoleSyncService.syncGroupRoles(user);
   }
   ```
   (No `@RequirePermission` — service enforces super_admin.)
4. `npm run build` to verify wiring/DI compiles.
5. Manual smoke (optional, local): boot app, call endpoint with a super_admin bearer token → 200 + report; with a normal user → 403.

## Success Criteria
- [ ] `POST v1/role/sync-group-roles` reachable; returns report for super_admin.
- [ ] Non-super_admin receives 403 (from service guard).
- [ ] App boots with no DI resolution errors (`npm run build` + start).

## Risk Assessment
- DI resolution failure if `GroupRoleSyncService` deps not in module scope. Mitigation: mirror `RoleService` provider list; verify at build/boot.
- PermissionGuard passing all authenticated users is intentional here — the ONLY gate is the service super_admin check. Mitigation: ensure the service guard is present and unit/e2e-tested (Phase 4).
