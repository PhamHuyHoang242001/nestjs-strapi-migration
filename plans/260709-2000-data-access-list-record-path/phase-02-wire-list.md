---
phase: 2
title: "Wire list"
status: pending
priority: P2
effort: "1h"
dependencies: [1]
---

# Phase 2: Wire list

## Overview
Inject `RecordPathService` into `DataAccessService`; in `list()`, build `record_path` per group and attach to each response entry. Additive field — keep `module_path` + `record_name`.

## Requirements
- Functional:
  - Each group in list response gets `record_path` (root→leaf `/`-separated).
  - Per-record walk: `Promise.all(groups.map(g => recordPath.buildPath(g.table_name, g.data_id)))`.
  - Walk error → fallback `ID: <data_id>` (catch per-record, don't fail whole list).
  - `table_name` falsy / not in ALLOWED_TABLES → `record_path = ID: <data_id>`.
- Non-functional:
  - No change to count/pagination/filter SQL.
  - `module_path` + `record_name` unchanged (backward compat).

## Architecture
- `DataAccessService` constructor: add `private readonly recordPath: RecordPathService`.
- `list()` after `batchFetchRecordNames` (line ~186), before assembling `data`:
  ```ts
  const paths = await Promise.all(groups.map((g) =>
    (g.table_name && ALLOWED_TABLES.has(g.table_name)
      ? this.recordPath.buildPath(g.table_name, g.data_id)
      : Promise.resolve(`ID: ${g.data_id}`)
    ).catch(() => `ID: ${g.data_id}`),
  ));
  ```
- In `data.map`: add `record_path: paths[i]`.

## Related Code Files
- Modify: `src/modules/data-access/data-access.service.ts` (constructor inject + list attach)
- Modify: `src/modules/data-access/data-access.module.ts` (provider + export RecordPathService)
- Read: `src/modules/data-access/data-access.controller.ts` (no change — list returns service output)

## Implementation Steps
1. Register `RecordPathService` in `data-access.module.ts` providers + exports.
2. Inject into `DataAccessService` constructor.
3. In `list()`: build paths array (Promise.all + per-record catch).
4. Attach `record_path` to each group in `data`.
5. Typecheck.

## Success Criteria
- [x] list response each group has `record_path`.
- [x] `module_path` + `record_name` unchanged.
- [x] Walk error doesn't fail list (fallback `ID:`).
- [x] No type errors.

## Risk Assessment
- N+1 query (≤50 groups × ≤5 depth) — acceptable admin UI; flag perf follow-up.
- Promise.all rejection: per-record `.catch` isolates failures. ✓
