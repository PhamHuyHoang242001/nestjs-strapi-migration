---
phase: 2
title: Implement + regression
status: completed
priority: P2
effort: 1.5h
dependencies:
  - 1
---

# Phase 2: Implement + regression

## Overview
Implement `hasAccessibleChildUnderParent` on `OwnerScopeResolverService` and compose it into bicc `resolveBiccCapabilities` for download/delete. Make Phase 1 tests green; run full regression across authz + data-access + diagnostic-report suites.

## Requirements
- Functional: isDownload/isDelete true when user can act on ≥1 child diagnostic report (user or role grant, deny subtracted) OR existing bicc-bound/SO path; isCreate unchanged.
- Non-functional: reuse cached `getAccessibleRecords` (no new permission resolution); injection-guard interpolated identifiers; `||` short-circuit to skip child query when bicc-bound grant already true.

## Architecture
Data flow for download/delete:
```
resolveChildVerb(verb)
  = canCreateUnderParent(userId, 'bi_hub_bicc_departments', biccId, verb)   // existing: bicc-bound OR SO
 || hasAccessibleChildUnderParent(userId, 'bi_hub_diagnostic_reports', biccId, verb)  // new: child subtree
```
`hasAccessibleChildUnderParent`:
1. guard `Number.isFinite(parentId)`.
2. `entry = HIERARCHY_MAP[childTable]`; if absent → false. `fkColumn = entry.fkColumn`; regex-guard `/^[a-z_]+$/`.
3. `ids = await permissionCache.getAccessibleRecords(userId, childTable, permission)`; if empty → false (no DB hit).
4. `SELECT 1 FROM "<childTable>" WHERE id = ANY($1) AND "<fkColumn>" = $2 AND deleted_at IS NULL LIMIT 1` with `[ids, parentId]`; return rows.length > 0.

## Related Code Files
- Modify: `src/common/authorization/services/owner-scope-resolver.service.ts` (add method; imports HIERARCHY_MAP already present).
- Modify: `src/modules/bicc-department/bicc-department.service.ts` (`resolveBiccCapabilities`: add `DIAG_REPORT_TABLE` const, `resolveChildVerb`, wire download/delete; isCreate untouched).

## Implementation Steps
1. Add `hasAccessibleChildUnderParent` to `OwnerScopeResolverService` per Architecture. Place near `canCreateUnderParent` with a doc comment explaining the asymmetry (create = parent-bound; download/delete = act-on-existing-child).
2. In `bicc-department.service.ts`:
   - add `const DIAG_REPORT_TABLE = 'bi_hub_diagnostic_reports';`
   - replace the `resolveVerb`/`Promise.all` block so isCreate uses the existing parent-bound call and download/delete use `resolveChildVerb`.
3. Run Phase 1 specs → green.
4. Regression sweep (run all, fix none-by-cheating):
   - `npx jest src/modules/bicc-department`
   - `npx jest src/common/authorization`
   - `npx jest src/modules/data-access`
   - `npx jest src/modules/bi-hub-diagnostic-report`
5. `npx tsc --noEmit -p tsconfig.json` (confirm no new errors in the two modified files).
6. Optional empirical check vs live DB: pick a user with a child-only download exception under a bicc; run the new SQL to confirm it returns the bicc (mirrors the /test verification approach used for the hierarchy fix).

## Success Criteria
- [ ] Phase 1 resolver + flag specs pass.
- [ ] All four regression suites pass; no test weakened/skipped to pass.
- [ ] tsc clean for modified files.
- [ ] isCreate behavior provably unchanged (existing create authz specs still pass).
- [ ] No write/enforcement gate modified (`bi-hub-diagnostic-report-write.service.ts` untouched).

## Risk Assessment
- Risk: SQL identifier interpolation → mitigated by HIERARCHY_MAP lookup + regex guard (same pattern as `hierarchy-validation`/`isInOwnedScope`).
- Risk: large accessible-id arrays in `ANY($1)` → bounded by user's actual grants; acceptable, and `getAccessibleRecords` is cached.
- Risk: cache staleness → child grant mutations already invalidate the user permission cache; no new invalidation path needed (verify during regression).
