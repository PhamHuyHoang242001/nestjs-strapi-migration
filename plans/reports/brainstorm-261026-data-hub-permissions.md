# Brainstorm: Data Hub permissions (consumer, dictionary, data service by department)

Date: 2026-10-26. Status: approved by user.

## Problem
Data Hub write APIs only require Bearer login. Need role-based create/update permissions per module, and data service writes scoped by "Đơn vị phát hành" (`department_id`). Users are assigned to departments via a config screen; one user may be in many departments. View stays open to every logged-in user.

## Codebase facts (scout)
- Existing authz: `@RequirePermission(...codes)` + `PermissionGuard` (OR, Redis cache 300s) in `src/common/authorization`; codes are string literals seeded by migrations into `modules` + `permission` (e.g. `migration/2608121100-add-prompt-library-permissions.ts`).
- Effective codes = role perms (`user_roles` → `roles_permissions`) + ALLOW exceptions in `data_access_users` (`permission-query.service.ts`).
- `users.type = 'super_admin'` bypasses PermissionGuard; dev BearerGuard injects super_admin user 1 when no Authorization header.
- No user↔department table, no "users holding permission X" API.
- "Đơn vị phát hành" = `data_hub_data_service_versions.department_id` → `data_hub_departments` (code, name; no division link). `/v1/data-hub/departments` is also used by filters and consumer forms.

## Decisions (user-confirmed)
1. **Codes (13)**:
   - `dh_consumer_create`, `dh_consumer_update` (update includes PATCH status)
   - `dh_logical_term_create`, `dh_logical_term_update`
   - `dh_physical_term_create` (incl. form bulk `POST /physical-terms/bulk`), `dh_physical_term_update` (incl. status), `dh_physical_term_delete`
   - `dh_data_service_create`, `dh_data_service_update` (incl. status)
   - `dh_department_view`, `dh_department_create`, `dh_department_update` (edit dept + add/remove members), `dh_department_delete`
2. Excel import (`POST /logical-terms/import`): super_admin only, no code.
3. Cross-mapping (logical form picks physicals / physical form picks logical): only the current form's permission.
4. Data service: effective = role code ∧ member of department, checked live per request.
   - Create: `dh_data_service_create` + member of submitted `department_id`.
   - Update/status: `dh_data_service_update` + member of current dept; changing dept requires membership of new dept too.
   - super_admin bypasses everything, sees all departments.
   - Error: 403 `DEPARTMENT_FORBIDDEN`.
5. Membership: one list per department (`data_hub_department_members`: department_id, user_id INT no FK, BaseLink, hard-delete, unique pair). Losing role keeps membership (ineffective); config shows each member's current rights.
6. Config screen: CRUD departments (code unique case-insensitive among live; soft delete; 409 if used by live data service version or consumer; delete removes members) + add/remove members. Member list and candidate picker show `can_create`/`can_update` per user. Picker lists only users having `dh_data_service_create` or `_update`.
7. FE flags:
   - `GET /v1/data-hub/departments/writable?action=create|update` → departments where member ∧ has that code; empty if none; all if super_admin. Existing `/departments` unchanged.
   - Data service detail: `is_update` (role ∧ department).
   - Consumer / logical / physical detail: `is_update` (role only).
   - `GET /v1/data-hub/my-permissions` → flags per module + `import` (super_admin) to hide buttons.
   - BE always enforces 403; FE only hides.

## Proposed API additions
- `GET /v1/data-hub/my-permissions`
- `GET /v1/data-hub/departments/writable?action=create|update`
- Config: `GET/POST /departments-config`, `GET/PUT/DELETE /departments-config/:id`, `GET /departments-config/:id/members`, `POST /departments-config/:id/members {user_ids}`, `DELETE /departments-config/:id/members/:userId`, `GET /departments-config/member-candidates?keyword=` (exact paths decided in plan).

## Out of scope
- History/audit of membership and department CRUD.
- Assigning codes to roles (admin uses existing role screen; migration only seeds codes).
- Data service review/approval flow.

## Risks
- Permission cache TTL 300s: role changes apply within 5 min; membership changes are immediate (DB read). Consider invalidation not needed.
- Dev auth bypass = super_admin → testing needs real tokens for non-admin test users (seed users with roles).
- Many existing write-service specs instantiate services directly; guards are controller-level so specs mostly unaffected, but data-service write services gain a department check → specs need a membership stub.
- Department delete must check usage in `data_hub_data_service_versions` (active versions of live services) and `data_hub_consumers`.

## Success criteria
- Each write endpoint returns 403 without its code; super_admin always passes.
- User with `dh_data_service_create` in DPD only: `/departments/writable?action=create` returns [DPD]; creating in DCR → 403.
- Update of DPD service by DPD member with update code OK; moving it to a dept they are not in → 403.
- Config member list shows can_create/can_update reflecting current roles.
- Import by non-super_admin → 403.

## Unresolved questions
- None blocking. Exact config route prefix and test-user seeding to settle in plan.
