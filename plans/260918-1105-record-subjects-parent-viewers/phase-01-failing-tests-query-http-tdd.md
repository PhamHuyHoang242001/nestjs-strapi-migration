---
phase: 1
title: Failing tests query+HTTP TDD
status: completed
priority: P2
effort: 4h
dependencies: []
---

# Phase 1: Failing tests query+HTTP TDD

## Overview

Viết test **fail trước** cho paginated reverse role/user + resolve parent + 400 cases. Không implement production.

## Requirements

- Functional: spec methods + service HTTP-facing behavior.
- TDD: red trước green.

## Architecture

Mirror `permission-query-record-users.spec.ts` QB fakes. Thêm `skip`/`take`/`getCount`/`getRawAndEntities` stubs khi method mới cần.

## Related Code Files

- Create: `src/common/authorization/__tests__/permission-query-record-subjects.spec.ts`
- Create: `src/modules/data-access/__tests__/record-subjects.service.spec.ts`
- Modify: none production

## Implementation Steps (tests first)

1. Query service tests (fail vì method chưa có):
   - `listRoleIdsForRecordPaged`: allow \ deny; search name; skip/take; total; SQL không `getRawMany` full dump (assert `skip`/`take`/`limit` called).
   - `listUserIdsForRecordPaged`: union role-members ∪ dau, minus deny; email search; page.
   - Invalid table regex → 400 (reuse existing guard).
2. DataAccessService tests (fail):
   - `table=bi_hub_reports`, `data_id=5` → parent `bi_hub_bicc_departments`, view code `bh_bicc_dept_view` (mock module/permission lookup).
   - Root table (`bi_hub_bicc_departments`) → 400.
   - Parent not in `RULE_TARGET_TABLES` → 400.
   - >1 parent `action=read` → 400.
   - Role items include `permissions` child module + `user_count`.
   - Pagination envelope `{ items, total, page, limit }`.
3. Run new specs → expect fail (missing methods). **Không** implement để pass.

## Success Criteria

- [ ] New spec files exist and fail for missing API (not false-green).
- [ ] Cases cover deny, pagination, parent resolve, 400s.
- [ ] No production code in this phase.

## Risk Assessment

Over-mocking QB ≠ SQL thật. Phase 4 chạy existing reverse-lookup + list tests. Optional later: one integration test nếu DB test harness sẵn.
