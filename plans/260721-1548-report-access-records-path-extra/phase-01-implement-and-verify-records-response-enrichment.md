---
phase: 1
title: "Implement and verify records response enrichment"
status: completed
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: Implement and verify records response enrichment

## Overview

Extend both records-browser query paths, then normalize returned rows through one private enrichment helper. Keep `record_extra` enrichment active while temporarily disabling `record_path` retrieval for this endpoint only.

## Context Links

- Endpoint: `src/modules/data-access/report-access-records.controller.ts:19`
- Service entry and branches: `src/modules/data-access/data-access.service.ts:908`
- Existing path/extra implementation: `src/modules/data-access/data-access.service.ts:202`, `src/modules/data-access/data-access.service.ts:405`
- Config: `src/modules/data-access/constants/hierarchy-config.ts:161`

## Requirements

- Functional:
  - Batch-fetch configured extra columns for the current page after the scoped/unscoped base query.
  - Temporarily omit `record_path` and do not call `RecordPathService.buildPath()` from the records-browser helper.
  - Return `record_extra` as `{ configuredColumn: value }`; omit key for empty/missing config.
  - Preserve `id`, `display_name`, `created_at`, ordering, filters, pagination metadata, and owner visibility.
  - Leave `GET /v1/data-access/list` path enrichment unchanged.
- Non-functional:
  - Use only sanitized columns returned by `getExtraFields()`.
  - Share enrichment/projection logic between both query paths where practical; no controller/DTO/schema changes.

## Architecture

`getRecords()` keeps current routing. `getUnscopedRecords()` and `getScopedRecords()` pass visible rows to a private helper that batch-fetches configured extras and returns the stable base shape plus optional `record_extra`. The helper's records-browser-only `record_path` lines stay commented with a temporary-disable note, so re-enabling is explicit without touching the independent list enrichment. The separate extras query preserves graceful omission when config/schema drift occurs. Whole-table SO already delegates to the unscoped branch, so it receives the behavior automatically.

## Related Code Files

- Modify: `src/modules/data-access/data-access.service.ts`
- Modify tests: `src/modules/data-access/__tests__/data-access-read.service.spec.ts`
- Modify tests: `src/modules/data-access/__tests__/data-access-getrecords-scoped.spec.ts`
- Regression only: `src/modules/data-access/__tests__/data-access-getrecords-owner-all.spec.ts`
- Regression only: `src/modules/data-access/services/__tests__/record-path.service.spec.ts`

## Implementation Steps

1. Capture current response baseline in existing unscoped/scoped specs: rows lack `record_path` and `record_extra` although list enrichment exists.
2. In `data-access.service.ts`, derive extra columns once per table via `getExtraFields(tableName)` and batch-fetch them for the visible page IDs.
3. Add a private row-enrichment helper that:
   - retains only the established base fields;
   - keeps records-browser path generation commented while the temporary hold is active;
   - nests configured values under `record_extra`, omitting the key when no fields are configured.
4. Call the helper from both data-query branches before building `itemCount`; do not change count/filter/owner SQL.
5. Extend unscoped test with a temporary `EXTRA_FIELDS_MAP.bi_hub_reports` entry, assert extra SELECT and `record_extra`, and cleanup config after test.
6. Extend owner-scoped and owner-all tests with the temporary omission contract while preserving owner-query coverage.
7. Run targeted suites, then build/typecheck and affected data-access regressions.
8. Temporarily comment out the helper's `RecordPathService.buildPath()` call and `record_path` projection; update records-browser tests to assert omission/no invocation while retaining `record_extra` coverage. Do not modify list code or list expectations.

## Todo List

- [x] Add shared records-browser enrichment in service.
- [x] Cover unscoped response and extras query.
- [x] Cover scoped response and owner-query preservation.
- [x] Cover fallback/omission behavior.
- [x] Run verification commands.
- [x] Temporarily disable records-browser `record_path` retrieval only.
- [x] Update records-browser regression expectations; confirm list path tests remain unchanged.

## Success Criteria

- [x] Unscoped response omits `record_path` and includes configured `record_extra`.
- [x] Scoped response has the same temporary shape without widening visible records.
- [x] No-config tables omit both enrichment keys; path service call remains commented in records-browser helper.
- [x] `itemCount` uses enriched row count and all existing meta values remain unchanged.
- [x] Focused records/list regression suites pass after the temporary contract adjustment: 5 suites, 62 tests.
- [x] Global build checked; 22 pre-existing unrelated TypeScript errors remain, with none in changed files.

## Risk Assessment

- Temporary omission is an API response-shape adjustment for the records browser; consumers expecting the newly added uncommitted `record_path` field must tolerate its absence until re-enabled.
- Configured invalid DB columns are isolated in a separate extras query; failure omits `record_extra` and keeps the page available, matching the existing list behavior.
- Raw extra columns must not leak at top level; normalize output through the helper.

## Security Considerations

- Never use query/client-provided column names; only `getExtraFields()` output may enter SQL.
- Preserve `ALLOWED_TABLES` gate and existing owner join/count constraints exactly.

## Next Steps

- No central changelog/roadmap exists to update for this minor additive API contract; journal capture is handled separately.
- Re-enable records-browser path generation only after the temporary hold is lifted; retain the current per-row failure fallback when doing so.
- Unresolved questions: none.
