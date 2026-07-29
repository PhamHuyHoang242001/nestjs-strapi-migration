---
name: project-manage-authority
description: How record-level "grant authority" + handover works in the data-access module (NestJS/TypeORM/Postgres)
metadata:
  type: project
---

Record-level grant authority is derived, NOT a new permission:
`canManageRecord = super_admin OR SO(isInOwnedScope) OR (editOnRecord ∧ holds verbCode)`.
`editOnRecord` = record in `getAccessibleRecords(user, table, EDIT_CODE)`, EDIT_CODE = module's permission with action='update'.

**Why:** avoid schema churn / new permission rows; reuse existing edit grant as the authority signal.

**How to apply when reviewing this area:**
- Opt-in per table via `MANAGE_ENABLED_MODULES` set in `constants/hierarchy-config.ts` (currently only `bi_hub_diagnostic_reports`). Tables outside keep prior global-verb-only behavior — check backward-compat claims against this set.
- Write gates (create/update/delete/removeLink/handover) MUST read DB directly (`bypassCache: true`) — the 120s permission cache would 403 an editor just granted access.
- `CallerContext` (helpers/manage-authority.helper.ts): `userId` trusted ONLY for client='user' (admin client uses a different id namespace). Fail-closed when userId undefined and not super_admin — never call getAccessibleRecords(undefined,...).
- SQL-injection guard for inline-id branches: table names come from static `MANAGE_ENABLED_MODULES`, ids filtered by `Number.isInteger`; record-id allow-lists use bind params (`= ANY($N)`).
- Junction soft-delete has TWO paths: `deleted_at` (TypeORM softDelete) AND `is_deleted` flag (manual). Any junction read filter must check BOTH or deleted grants leak (see permission-query.service.ts queryDataIds + queryUsersForRecord).
- tsconfig has `strictNullChecks: false`; repo does NOT lint-clean at HEAD (pre-existing `any` errors in data-access.service.ts); 4 test suites fail on clean HEAD (data-access-interceptor-with-owner, transform-file-auth.guard, role.service, role-owner-assignment) — unrelated, do not flag.
