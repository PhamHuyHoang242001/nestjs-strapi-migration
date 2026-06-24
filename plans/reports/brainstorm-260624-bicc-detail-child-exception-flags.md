# Brainstorm: bicc detail capability flags honor child-report exceptions

Date: 2026-06-24
Work context: nestjs-new/base-be-ts-sql

## Problem
bicc detail API (`details()`) returns isCreate/isDownload/isDelete. User w/ role read-only on bicc+diag reports, plus a `user_data_access` exception granting crud+download on a specific child diagnostic report → bicc detail flags all false. Expected: download/delete should reflect the child exception.

## Root cause
`bicc-department.service.ts:92-93` resolves each flag via `canCreateUnderParent(userId, 'bi_hub_bicc_departments', biccId, verb)` → `getAccessibleRecords(userId, 'bi_hub_bicc_departments', verb)`, keyed strictly to the **bicc table**. Only bicc-bound grants (role/user) or SO are seen. `user_data_access` bound to a **child report** (`bi_hub_diagnostic_reports`) is invisible → false.

Per-report `findOne` flags (`bi-hub-diagnostic-report.service.ts:144-152`) already honor the exception (they query the child table), so the bug is the bicc-level aggregation only.

`getAccessibleRecords` (`permission-query.service.ts:67-129`) already folds (allow_role ∪ allow_user) \ (deny_role ∪ deny_user). Fix = probe the child subtree, not change permission resolution.

## Decisions (user-confirmed)
1. **isCreate** stays parent-bound (unchanged). create = new report under bicc, enforced by `canCreateUnderParent` at write (`bi-hub-diagnostic-report-write.service.ts:56`); a child exception must NOT flip it (would show a Create button that 403s).
2. **isDownload/isDelete** also true if user can act on ≥1 child diagnostic report — via user_data_access OR role_data_access, deny subtracted.
3. Scope: only `bi_hub_diagnostic_reports`.

## Design
New method `OwnerScopeResolverService.hasAccessibleChildUnderParent(userId, childTable, parentId, permission)`:
- lookup `HIERARCHY_MAP[childTable]` → fkColumn (regex-guarded);
- `ids = getAccessibleRecords(userId, childTable, permission)` (cached, role+user allow − deny);
- `SELECT 1 FROM "<childTable>" WHERE id = ANY($1) AND "<fk>" = $2 AND deleted_at IS NULL LIMIT 1`.

`resolveBiccCapabilities`:
- isCreate = `canCreateUnderParent(... DIAG_CREATE_VERB)` (unchanged)
- isDownload/isDelete = `canCreateUnderParent(... verb)` OR `hasAccessibleChildUnderParent('bi_hub_diagnostic_reports', biccId, verb)` (|| short-circuits child query)

## Risks / impact
- `bicc-department-capability-flags.spec.ts` mocks only `canCreateUnderParent` → add `hasAccessibleChildUnderParent` mock + new child-exception cases (download/delete true, create false).
- No write/enforcement gate changes → no UX/403 mismatch.
- Cache: existing getAccessibleRecords invalidation covers flag refresh.
- Cost: +2 cached calls + ≤2 tiny EXISTS queries per detail. Negligible.

## Unresolved
None.
