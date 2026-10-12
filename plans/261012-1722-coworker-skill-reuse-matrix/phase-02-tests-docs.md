---
phase: 2
title: Tests + docs
status: completed
priority: P2
effort: 1.5h
dependencies:
  - 1
---

# Phase 2: Tests + docs

## Overview

Unit-test the matrix query (mocked `manager.query` + `getPublishersByIds`) and the controller auth/route. Update `docs/codebase-summary.md`. Tests written against the locked contract in `plan.md`.

## Requirements

- Functional: specs fail without the Phase 1 service, pass with it.
- Non-functional: no live DB. Follow coworker/skill query spec harness style.

## Related Code Files

- Create: `src/modules/coworker/__tests__/coworker-reuse-matrix.service.spec.ts`
- Create: `src/modules/coworker/__tests__/coworker-reuse-matrix.controller.spec.ts` (or a thin describe in an existing controller spec if one exists)
- Modify: `docs/codebase-summary.md`

## Implementation Steps

1. Service spec — mock `EntityManager.query` in call order (columns, count, page, links) or by SQL substring. Cover:
   - Empty catalog → `columns: []`, `rows: []`, `meta.total = 0`
   - Tick alignment: 2 coworkers × 1 skill, only coworker A linked → `cells: [true, false]` matching column order
   - Inactive coworker/skill omitted even if a join row exists
   - Soft-deleted join row does not tick
   - Skill with no active version omitted
   - Coworker with no active version omitted
   - Pagination: `limit=1` returns 1 row, `meta.total` still full count; page 2 uses offset
   - Publisher resolved via `getPublishersByIds`; unknown id → `publisher.name = null`
   - SQL never concatenates request strings; `LIMIT/OFFSET` bound
2. Controller spec (or route metadata test):
   - Handler registered at `reuse-matrix`
   - `RequirePermission('coworker_upload')` present
   - Missing user → 403
3. `docs/codebase-summary.md`: one paragraph under AI Hub — path, shape, active-only tick, `coworker_upload`.
4. Run:
   `npx jest src/modules/coworker/__tests__/coworker-reuse-matrix.service.spec.ts --forceExit`

## Success Criteria

- [ ] New specs pass
- [ ] Existing coworker + skill query specs still pass (no contract change)
- [ ] Docs mention the endpoint and the active-version tick rule

## Risk Assessment

- Mock SQL order is brittle if service parallelizes column + skill queries (`Promise.all`). Assert by SQL content (`coworker_packages` vs `skill_packages` vs `skill_version_coworkers`), not call index.

## Security Considerations

- Spec proves inactive/deleted rows never appear as columns or ticks (data leak of unpublished catalog).
