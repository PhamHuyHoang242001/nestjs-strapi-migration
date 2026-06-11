---
title: Grouped Data Access List API
description: >-
  Restructure GET /v1/data-access/list to group by (data_id, module_id),
  paginate by groups, include record names from target tables, and add
  record_name search
status: completed
priority: P2
branch: main
tags:
  - data-access
  - api
  - grouped-list
  - tdd
blockedBy: []
blocks: []
created: '2026-06-04T10:10:45.420Z'
createdBy: 'ck:plan'
source: skill
planDir: plans/260604-grouped-data-access-list-api
---

# Grouped Data Access List API

## Overview

Replace flat `GET /v1/data-access/list` (1 subject per row) with grouped response where each item = 1 record `(data_id, module_id)` containing all related rules. Add `record_name` from target tables. Paginate at group level.

**Brainstorm:** `plans/reports/brainstorm-260604-grouped-data-access-list-api.md`

**Approach:** Two-step SQL + batch record lookup
1. Paginated groups query (DISTINCT data_id, module_id with filters)
2. Fetch flattened rules for those groups (reuse existing CTE)
3. Batch record names by table_name
4. Assemble in code

**TDD Mode:** Tests written before implementation per phase.

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Lock Current List Behavior Tests](./phase-01-lock-current-list-behavior-tests.md) | Pending | Completed |
| 2 | [Write Grouped List Tests](./phase-02-write-grouped-list-tests.md) | Pending | Completed |
| 3 | [Implement Grouped List Query](./phase-03-implement-grouped-list-query.md) | Pending | Completed |
| 4 | [Search by Record Name](./phase-04-search-by-record-name.md) | Pending | Completed |

## Key Files

| File | Role |
|------|------|
| `src/modules/data-access/data-access.service.ts` | Main change — `list()` method |
| `src/modules/data-access/data-access.controller.ts` | Update Swagger summary |
| `src/modules/data-access/dto/search-data-access.dto.ts` | Read-only (no DTO change needed) |
| `src/modules/data-access/constants/hierarchy-config.ts` | Read-only — reuse `NAME_COLUMN_MAP`, `ALLOWED_TABLES` |
| `src/modules/data-access/__tests__/data-access-list.service.spec.ts` | NEW — unit tests |

## Response Shape

```json
{
  "data": [
    {
      "data_id": 42,
      "module_id": 5,
      "module_name": "Reports",
      "module_path": "/BI Hub/Reports",
      "record_name": "Q2 Revenue Analysis",
      "table_name": "bi_hub_reports",
      "rules": [
        {
          "rule_id": 1, "scope_type": "allow",
          "subject_type": "role", "subject_id": 3, "subject_name": "Manager",
          "permissions": null,
          "start_date": null, "end_date": null, "created_at": "2026-05-15T10:20:00Z"
        }
      ]
    }
  ],
  "meta": { "totalItems": 50, "itemCount": 10, "itemsPerPage": 10, "currentPage": 1, "totalPages": 5 }
}
```

## Dependencies

No cross-plan dependencies. Self-contained change to `list()` method.
