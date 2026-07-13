---
phase: 4
title: "Tests + typecheck"
status: pending
priority: P2
effort: "1h"
dependencies: [1, 2, 3]
---

# Phase 4: Tests + typecheck

## Overview
Integration assertions: list + details attach `record_path`; no regression in existing data-access tests; tsc clean.

## Requirements
- Functional:
  - list spec: response groups carry `record_path`; `module_path`/`record_name` unchanged.
  - details spec: response carries `record_path`; `record_info` unchanged.
  - Existing data-access tests still pass (no regression in list query/filter/pagination).
- Non-functional:
  - DB-mocked specs (DataSource.query mocked).
  - `tsc --noEmit`: 0 new errors in data-access module.

## Architecture
- Extend/inspect existing data-access spec (if any list test) OR add minimal list+details spec asserting `record_path` field presence + shape.
- Mock `RecordPathService` in list/details specs (inject as stub returning scripted path) — isolate from walk logic (walk tested in phase-01).

## Related Code Files
- Test: `src/modules/data-access/services/__tests__/record-path.service.spec.ts` (phase-01, run again)
- Test: list + details integration assertions (new or extended spec)
- Read: existing data-access specs (find them under `__tests__/`)

## Implementation Steps
1. Locate existing data-access service specs.
2. Add list assertion: `record_path` present per group; `module_path`/`record_name` intact.
3. Add details assertion: `record_path` present; `record_info` intact.
4. Run full data-access test suite.
5. `npx tsc --noEmit -p tsconfig.json` → 0 new errors in data-access.

## Success Criteria
- [x] list spec asserts `record_path` + unchanged siblings.
- [x] details spec asserts `record_path` + unchanged `record_info`.
- [x] Existing data-access tests pass (no regression).
- [x] tsc: 0 new errors in data-access module.

## Risk Assessment
- Mocking `RecordPathService` in integration specs (stub) — ensure stub returns predictable path so list/details assertions don't couple to walk impl.
- Existing data-access spec coverage unknown — scout first; add only if list path untested.
