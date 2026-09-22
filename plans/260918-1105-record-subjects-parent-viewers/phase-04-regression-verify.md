---
phase: 4
title: Regression verify
status: completed
priority: P2
effort: 2h
dependencies:
  - 3
---

# Phase 4: Regression verify

## Overview

Chạy suite authorization + data-access. Confirm không đổi behavior reverse lookup cũ.

## Requirements

- Non-functional: không regress RAM path của method cũ (vẫn unpaged — out of scope).

## Related Code Files

- None unless tests fail.

## Implementation Steps

1. `yarn test` scoped:
   - `src/common/authorization/__tests__/permission-query-record-users.spec.ts`
   - `src/common/authorization/__tests__/permission-query-record-subjects.spec.ts`
   - `src/modules/data-access/__tests__/record-subjects.service.spec.ts`
   - `src/modules/data-access/__tests__/data-access-create.service.spec.ts`
   - `src/modules/data-access/__tests__/data-access-list.service.spec.ts`
2. Fix only regressions caused by this feature.
3. Typecheck if project script exists (`yarn tsc` / nest build) — don't invent scripts.

## Success Criteria

- [ ] New + listed old specs pass.
- [ ] Controller still only adds 2 GETs.

## Risk Assessment

PermissionQueryService constructor arity change → update all instantiations in specs. Grep `new PermissionQueryService`.
