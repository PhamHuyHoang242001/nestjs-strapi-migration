---
phase: 2
title: Department config and members
status: completed
priority: P1
effort: 1d
dependencies:
  - 1
---

# Phase 2: Department config and members

## Overview
Membership table + department config APIs (CRUD departments, add/remove members, candidate picker) with each user's current data-service rights.

## Requirements
- Functional:
  - Table `data_hub_department_members` (`BASE_LINK`, `department_id INT NOT NULL REFERENCES data_hub_departments(id) ON DELETE CASCADE`, `user_id INT NOT NULL`, `UNIQUE (department_id, user_id)`), hard-delete links.
  - Department code unique case-insensitive among live rows: change `uq_data_hub_departments_code_live` to `ci('code')` in the migration's `liveUniques`.
  - Config routes (prefix `/v1/data-hub/department-configs`, all `PermissionGuard`; super_admin bypass):
    | Method & path | Code | Notes |
    |---|---|---|
    | `GET /` | view | keyword/page/limit (`DataHubPageQueryDto`), item `{id, code, name, member_count, updated_at}`, newest first |
    | `GET /:id` | view | `{id, code, name, members:[{id,email,can_create,can_update}], created_by_user, updated_by_user, created_at, updated_at}` |
    | `POST /` | create | `{code(≤100), name(≤255)}`; 409 `DEPARTMENT_CODE_EXISTS` |
    | `PUT /:id` | update | same body; `NO_CHANGES`; 409 code exists |
    | `DELETE /:id` | delete | soft delete; 409 `DEPARTMENT_IN_USE` if any live data service's active version or any live consumer references it; deletes members |
    | `GET /member-candidates?keyword=&page&limit` | update | users holding `dh_data_service_create` or `_update` (role + valid ALLOW exceptions), `{id,email,can_create,can_update}`; email ILIKE keyword |
    | `POST /:id/members` | update | `{user_ids:number[] 1..100 unique}`; each must be a live user (`assertUsers`) AND a candidate, else 400 `INVALID_MEMBERS: ids`; existing pairs ignored (`ON CONFLICT DO NOTHING`) |
    | `DELETE /:id/members/:userId` | update | 404 if not a member |
  - `can_create`/`can_update` computed live from roles, so a member who lost the role shows both false ("Không có quyền").
  - Public `GET /v1/data-hub/departments` unchanged (filters/consumer forms).
- Non-functional: member rights for a page computed in one query (not per user).

## Architecture
- Add to `PermissionQueryService` (DRY with `getUserPermissions` SQL at `permission-query.service.ts:20-61`): `getUserCodesForUsers(userIds, codes): Map<userId, Set<code>>` and `findUserIdsWithAnyCode(codes, keyword?, page, limit)`. Both must use the same role + ALLOW-exception rules. If touching common is undesirable, put the SQL in `data-hub/common/data-hub-permission-holders.util.ts` with a comment pointing to the shared rule — decide at implementation; prefer common.
- New sub-folder `src/modules/data-hub/department/`: `department-config.controller.ts`, `department-config-query.service.ts`, `department-config-write.service.ts`, `department-members.util.ts`, `dto/`, `__tests__/`; module `data-hub-department.module.ts` registered in `DataHubModule`.
- Entity `src/modules/databases/data-hub-department-member.entity.ts`.
- Migration: append table + index change to uncommitted `2610221500-create-data-hub-tables.ts` (down drops it); apply locally via temp script.

## Related Code Files
- Create: department folder files above, entity, specs.
- Modify: `2610221500-create-data-hub-tables.ts`, `data-hub.module.ts`, `src/common/authorization/services/permission-query.service.ts` (+ its spec).

## Implementation Steps (TDD)
1. Specs first: write service (create dup → 409, update NO_CHANGES, delete in use → 409, delete removes members, add members rejects non-candidate/non-user, idempotent add), query service (member rights mapping incl. "no rights"), candidates (only holders), controller guard metadata (`@RequirePermission` codes per route via Reflector).
2. Red → implement → green.
3. Migration edit + local apply (`CREATE TABLE IF NOT EXISTS`, drop/recreate code unique index); verify on scratch schema.
4. tsc, eslint, jest.

## Success Criteria
- [ ] All new specs fail before / pass after.
- [ ] Live: create dept, add user holding `dh_data_service_create` → detail shows `can_create:true, can_update:false`; remove role → shows both false.
- [ ] Delete dept used by a service → 409.

## Risk Assessment
- Permission rule drift between new query and `getUserPermissions` → share SQL fragment / same method.
- Cache: membership not cached → immediate; role changes up to 300s.
- Department rows seeded from mock with codes that may differ only by case → check before switching index to ci.
