---
phase: 1
title: Permission codes and access service
status: completed
priority: P1
effort: 4h
dependencies: []
---

# Phase 1: Permission codes and access service

## Overview
Seed the 13 Data Hub codes and add one shared `DataHubAccessService` that answers "can this user do X" (role codes, super_admin, department membership) plus `GET /v1/data-hub/my-permissions`.

## Requirements
- Functional:
  - Codes (module id 105 "Data Hub", path `/data-hub`; permission ids 119-131 — live DB had MAX(permission.id)=118, MAX(modules.id)=104 on 2026-10-26, re-check before writing):
    `dh_consumer_create`, `dh_consumer_update`, `dh_logical_term_create`, `dh_logical_term_update`, `dh_physical_term_create`, `dh_physical_term_update`, `dh_physical_term_delete`, `dh_data_service_create`, `dh_data_service_update`, `dh_department_view`, `dh_department_create`, `dh_department_update`, `dh_department_delete` (13 codes; Excel import has no code, super_admin only).
  - `my-permissions` → `{ consumer:{create,update}, logical_term:{create,update}, physical_term:{create,update,delete}, data_service:{create,update}, department:{view,create,update,delete}, import: boolean, is_super_admin: boolean }`.
- Non-functional: one Redis-cached read per request (`PermissionCacheService.getPermissions`); no new cache layer.

## Architecture
- Migration `src/migration/2610261000-add-data-hub-permissions.ts`, copying the guard pattern of `2608121100-add-prompt-library-permissions.ts` (table-name candidates, id-collision guards, `ON CONFLICT (id) DO UPDATE`, down deletes only these ids + module 105).
- `src/modules/data-hub/common/data-hub-permission-codes.ts`: exported `DH_PERMISSIONS` const object (single source for controllers, service, tests).
- `src/modules/data-hub/common/data-hub-access.service.ts`:
  - `isSuperAdmin(user)` — `user.type === 'super_admin'` (same rule as `permission.guard.ts:27-30`).
  - `codes(userId)` → `PermissionCacheService.getPermissions`.
  - `myPermissions(user)` → flags above (super_admin → all true).
  - `assertSuperAdmin(user)` → 403 `SUPER_ADMIN_ONLY`.
  - Department helpers added in phase 2/3 (`departmentIds(userId)`, `writableDepartmentIds(user, action)`, `assertDepartmentWrite`).
- `data-hub-access.controller.ts`: `GET /v1/data-hub/my-permissions` (BearerGuard only).
- Register `AuthorizationModule` import in `DataHubCommonModule` if not global; export `DataHubAccessService`.

## Related Code Files
- Create: migration above, `common/data-hub-permission-codes.ts`, `common/data-hub-access.service.ts`, `common/data-hub-access.controller.ts`, `common/__tests__/data-hub-access.spec.ts`
- Modify: `common/data-hub-common.module.ts`
- Read: `src/common/authorization/guards/permission.guard.ts`, `services/permission-cache.service.ts`, `authorization.module.ts`

## Implementation Steps (TDD)
1. Write `data-hub-access.spec.ts` first: super_admin → all flags true + import true; user with `dh_consumer_create` only → consumer.create true, rest false, import false; controller rejects missing user (403) like stats controller.
2. Run → red.
3. Implement codes const, service, controller, module wiring → green.
4. Write migration; dry-run on scratch schema copy of `permission`/`modules` (search_path trick) or apply locally via temp script; verify rows; delete script.
5. tsc + eslint (hand-fix) + data-hub jest.

## Success Criteria
- [ ] Spec red before, green after.
- [ ] Local DB has module 105 + the codes; re-run of migration is idempotent; ids not colliding.
- [ ] `GET /my-permissions` without token (dev super_admin) → all true.

## Risk Assessment
- Id collision if another branch seeds 119+ → guards throw; pick next free ids at implementation time.
