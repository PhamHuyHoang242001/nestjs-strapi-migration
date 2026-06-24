---
phase: 1
title: Tests-first (failing)
status: completed
priority: P2
effort: 1h
dependencies: []
---

# Phase 1: Tests-first (failing)

## Overview
Write the failing unit tests that lock in the new behavior before implementation: a new resolver method `hasAccessibleChildUnderParent`, and bicc-detail flag cases where a child-report exception flips isDownload/isDelete (but NOT isCreate).

## Requirements
- Functional: tests assert child-subtree grants surface in bicc-level download/delete flags; isCreate stays parent-bound.
- Non-functional: tests deterministic, mock-based (no real DB), match existing spec style in the repo.

## Architecture
Two test surfaces:
1. **Resolver unit** — new spec for `OwnerScopeResolverService.hasAccessibleChildUnderParent(userId, childTable, parentId, permission)`. Mock `permissionCache.getAccessibleRecords` + `ds.query`. Verify: empty accessible → false (no DB hit); unknown childTable (not in HIERARCHY_MAP) → false; accessible ids present + EXISTS row → true; accessible ids present + no EXISTS row → false; fkColumn used = `bicc_department_id` for `bi_hub_diagnostic_reports`.
2. **bicc flag composition** — extend `bicc-department-capability-flags.spec.ts`. The service mock currently only stubs `canCreateUnderParent`; add a `hasAccessibleChildUnderParent` stub to the `ownerScope` mock so existing cases keep passing, and add new cases.

## Related Code Files
- Create: `src/common/authorization/services/__tests__/owner-scope-resolver-child.spec.ts` (or alongside existing owner-scope specs — match repo location convention; check `owner-scope-helpers.spec.ts` placement under `modules/data-access/__tests__`).
- Modify: `src/modules/bicc-department/bicc-department-capability-flags.spec.ts`

## Implementation Steps
1. Locate existing owner-scope spec placement convention (grep for `owner-scope` specs). Create the resolver spec in the matching location.
2. Resolver spec — cases:
   - `returns false and skips DB when no accessible child records` (getAccessibleRecords → []; assert `ds.query` not called).
   - `returns false for child table without hierarchy config` (childTable not in HIERARCHY_MAP).
   - `returns true when an accessible child belongs to the parent` (getAccessibleRecords → [11,12]; ds.query → [{exists:1}]); assert SQL contains `bicc_department_id` and params `[ [11,12], biccId ]`.
   - `returns false when accessible children belong to other parents` (ds.query → []).
3. Update `bicc-department-capability-flags.spec.ts`:
   - Add `hasAccessibleChildUnderParent: jest.fn().mockResolvedValue(false)` to the `ownerScope` mock in `buildService` (param: optional `childGrantedVerbs` set, mirroring `grantedVerbs`).
   - Keep existing cases green (download/delete still false when only CREATE bicc-bound AND no child grant).
   - New case: **child exception only** — `grantedVerbs=∅`, `childGrantedVerbs={DOWNLOAD,DELETE}` → expect isCreate=false, isDownload=true, isDelete=true. Assert `hasAccessibleChildUnderParent` NOT called for CREATE verb.
   - New case: **bicc-bound create + child download** → isCreate=true (via canCreateUnderParent), isDownload=true (via child), isDelete=false.
4. Run the two specs; confirm they FAIL (method undefined / new assertions unmet) — proving the tests exercise unimplemented behavior.

## Success Criteria
- [ ] Resolver spec exists with the 4 cases above and currently fails (method not implemented).
- [ ] `bicc-department-capability-flags.spec.ts` updated; new child-exception cases fail against current code; existing cases still describe correct expectations.
- [ ] No production code changed in this phase.

## Risk Assessment
- Risk: spec placement diverges from repo convention → grep first, mirror `owner-scope-helpers.spec.ts`.
- Risk: forgetting the new mock fn makes existing flag cases throw "not a function" once Phase 2 lands — addressed by adding the stub here.
