---
title: Record-subjects parent viewers APIs
description: >-
  2 GET paginated APIs list roles/users with explicit VIEW on parent of a child
  table being created.
status: completed
priority: P2
effort: 1.5d
branch: main
tags:
  - feature
  - backend
  - api
  - auth
blockedBy: []
blocks: []
created: '2026-09-18'
createdBy: 'ck:plan'
source: skill
---

# Record-subjects parent viewers APIs

## Overview

TDD: 2 GET `/v1/data-access/record-subjects/roles|users`. Query `table`=child, `data_id`=parent id. Resolve parent via `HIERARCHY_MAP`. Explicit VIEW on parent (`action=read` on parent module). SQL-paginated. Role payload: child-module permissions `{id,code,action}` + `user_count`. Không sửa API cũ / `getUsersByRecordPermission`.

Brainstorm: `./reports/brainstorm-summary.md`

## Locked decisions

- Gate: `perm_data_access_create` only.
- Explicit-only, allow \ deny. No SO/super_admin.
- Search: roles `name`; users `email`.
- `PERPAGE_MAXIMUM` = 100.
- Parent >1 `action=read` → 400.
- Child must have parent in `HIERARCHY_MAP`; parent ∈ `RULE_TARGET_TABLES`.
- Do not cache (same as current reverse lookup comment: query DB). Optional later.

## Phases (TDD)

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Failing tests query+HTTP TDD](./phase-01-failing-tests-query-http-tdd.md) | Completed |
| 2 | [Implement paginated reverse lookup](./phase-02-implement-paginated-reverse-lookup.md) | Completed |
| 3 | [Wire controller DTO hydrate](./phase-03-wire-controller-dto-hydrate.md) | Completed |
| 4 | [Regression verify](./phase-04-regression-verify.md) | Completed |

## Dependencies

None. Reverse-lookup plan `260716-1742-reverse-record-permission-users-api` **completed**. Reuse join semantics, not its unpaged method.

## Success

Example: `GET .../roles?table=bi_hub_reports&data_id=5&page=1&limit=20` → roles with explicit `bh_bicc_dept_view` on BICC 5; each role has `bh_report_*` ticks + `user_count`.
