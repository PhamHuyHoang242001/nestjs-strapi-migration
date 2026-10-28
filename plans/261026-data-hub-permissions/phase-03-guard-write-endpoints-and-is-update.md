---
phase: 3
title: Guard write endpoints and is_update
status: completed
priority: P1
effort: 1d
dependencies:
  - 1
  - 2
---

# Phase 3: Guard write endpoints and is_update

## Overview
Put codes on every write endpoint, scope data-service writes by department, restrict Excel import to super_admin, add `departments/writable` and `is_update` on details.

## Requirements
- Endpoint → code (class keeps `BearerGuard`; add `PermissionGuard` + `@RequirePermission` per method):
  | Controller | Route | Code |
  |---|---|---|
  | consumer | `POST /` | `dh_consumer_create` |
  | consumer | `PUT /:id`, `PATCH /:id/status` | `dh_consumer_update` |
  | logical-term | `POST /` | `dh_logical_term_create` |
  | logical-term | `PUT /:id` | `dh_logical_term_update` |
  | logical-term | `POST /import` | super_admin only (`DataHubAccessService.assertSuperAdmin`) → 403 `SUPER_ADMIN_ONLY` |
  | physical-term | `POST /`, `POST /bulk` | `dh_physical_term_create` |
  | physical-term | `PUT /:id`, `PATCH /:id/status` | `dh_physical_term_update` |
  | physical-term | `DELETE /:id` | `dh_physical_term_delete` |
  | data-service | `POST /` | `dh_data_service_create` + department check |
  | data-service | `PUT /:id`, `PATCH /:id/status` | `dh_data_service_update` + department check |
- Department check (in write service, inside the existing transaction, after row lock):
  - create: `dto.department_id ∈ memberDepartments(user)` unless super_admin.
  - update: current active version's `department_id` ∈ member set AND (if changed) new `department_id` ∈ member set.
  - status: current department ∈ member set.
  - Fail → 403 `DEPARTMENT_FORBIDDEN`.
- `GET /v1/data-hub/departments/writable?action=create|update` (Bearer only): departments (live) where user is member ∧ holds the matching code; super_admin → all live; `[]` otherwise. Shape `{data:[{id,code,name}]}` like `/departments`. Declare before any `:id` route.
- `is_update` on detail responses:
  - consumer / logical / physical detail: user holds the module's update code (or super_admin).
  - data service detail: `dh_data_service_update` ∧ member of the active version's department (or super_admin).
- Detail services get the caller (`user`) from controller; keep services free of request objects.

## Architecture
- `DataHubAccessService` gains `memberDepartmentIds(userId)` (single SELECT on `data_hub_department_members` joined to live departments), `writableDepartmentIds(user, action)`, `assertDepartmentWrite(user, ...departmentIds)`, `canUpdate(user, code, departmentId?)`.
- Data service write service receives `user` (id + type) instead of only `userId`; adjust controller calls.
- Status endpoints share the update code (user decision: update includes active/inactive).

## Related Code Files
- Modify: the 4 controllers, `data-hub-data-service-write.service.ts`, detail services (`data-hub-consumer-query.service.ts`, `logical-term-query.service.ts`, `physical-term-detail.service.ts`, `data-hub-data-service-detail-query.service.ts`), `data-hub-org.controller.ts` (writable route) or access controller, related specs.

## Implementation Steps (TDD)
1. Specs first:
   - Guard metadata spec per controller: each write handler has the expected `@RequirePermission` codes and `PermissionGuard` (Reflector read) — locks the table above.
   - Import: non-super_admin → 403, super_admin → proceeds.
   - Data service write: create in non-member dept → 403; member → ok; super_admin → ok; update moving to non-member dept → 403; status on non-member → 403.
   - writable departments: none / member-without-code / member-with-code / super_admin.
   - is_update true/false per case for each detail.
2. Red → implement → green; update existing specs that construct write services (pass a super_admin or member stub).
3. tsc, eslint, full data-hub jest.

## Success Criteria
- [ ] Every write route returns 403 for a user without its code (spec + live check in phase 5).
- [ ] Data service department rules enforced; super_admin bypass.
- [ ] `is_update` present on 4 details; writable endpoint matches rules.

## Risk Assessment
- Dev BearerGuard injects super_admin when no token → FE in dev always sees everything; real tests need tokens (phase 5).
- PermissionGuard expects `request.info.user` shape — confirm BearerGuard sets `type`; reuse exact access pattern from skill controllers.
- Breaking: existing FE flows unaffected for super_admin; normal users without roles lose write access immediately — intended.
