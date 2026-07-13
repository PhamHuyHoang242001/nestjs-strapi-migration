---
phase: 3
title: "Wire details"
status: pending
priority: P2
effort: "30m"
dependencies: [1]
---

# Phase 3: Wire details

## Overview
In `details()`, build `record_path` for the single rule's `data_id` + module `table_name` and return alongside `record_info`.

## Requirements
- Functional:
  - `details/:id` response includes `record_path` (root→leaf).
  - `table_name` falsy / not ALLOWED_TABLES → `record_path = ID: <data_id>`.
  - Walk error → fallback `ID: <data_id>` (catch).
- Non-functional:
  - `record_info` + existing fields unchanged.

## Architecture
- `details()` (service:368): after fetching `record_info`, compute:
  ```ts
  const record_path = tableName && ALLOWED_TABLES.has(tableName)
    ? await this.recordPath.buildPath(tableName, record.data_id).catch(() => `ID: ${record.data_id}`)
    : `ID: ${record.data_id}`;
  return { ...record, record_info, record_path };
  ```

## Related Code Files
- Modify: `src/modules/data-access/data-access.service.ts` (details return)

## Implementation Steps
1. In `details()`, compute `record_path` after `record_info`.
2. Return `{ ...record, record_info, record_path }`.
3. Typecheck.

## Success Criteria
- [x] details response has `record_path`.
- [x] `record_info` unchanged.
- [x] Fallback on disallowed table / walk error.
- [x] No type errors.

## Risk Assessment
- Single record → single walk (≤5 queries). Negligible perf.
