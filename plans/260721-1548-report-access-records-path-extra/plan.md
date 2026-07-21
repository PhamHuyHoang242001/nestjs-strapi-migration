---
title: "Enrich report-access records with path and extra fields"
description: "Add configured record_extra to GET /v1/report-access/records/:tableName; keep record_path retrieval temporarily disabled."
status: completed
priority: P2
branch: "main"
tags: [data-access, report-access, records-browser]
blockedBy: []
blocks: []
created: "2026-07-21T08:48:59.637Z"
createdBy: "ck:plan"
source: skill
---

# Enrich report-access records with path and extra fields

## Overview

`GET /v1/report-access/records/:tableName` previously returned only `id`, `display_name`, and `created_at`. It now reuses the `EXTRA_FIELDS_MAP/getExtraFields()` contract from `GET /v1/data-access/list`, so browsed records expose `record_extra` only when fields are configured for that table. `record_path` retrieval is temporarily disabled for this endpoint and remains unchanged in `GET /v1/data-access/list`.

Root cause: the records-browser queries build their own projections in `DataAccessService.getUnscopedRecords()` and `getScopedRecords()` and never call the enrichment used by the data-access list (`data-access.service.ts:933-960`, `1012-1039` versus `202-242`, `405-465`).

Temporary contract:
- `record_path`: omitted from the records-browser response; `RecordPathService.buildPath()` is not called by this endpoint.
- `record_extra`: additive object, present only when `getExtraFields(tableName)` returns configured columns.
- Existing pagination, filtering, owner scoping, and base fields remain unchanged.
- `GET /v1/data-access/list` keeps its existing `record_path` and `record_extra` behavior.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Implement and verify records response enrichment](./phase-01-implement-and-verify-records-response-enrichment.md) | Completed |

## Dependencies

- Builds on completed plans `260709-2000-data-access-list-record-path` and `260717-1049-data-access-list-extra-fields-per-table`; no active-plan blocker.
- No controller, DTO, database schema, migration, or backend-external change.

## Success Criteria

- Both unscoped and owner-scoped record lists return configured `record_extra` with identical semantics and omit `record_path`.
- Whole-table-owner flow inherits the same result through `getUnscopedRecords()`.
- No records-browser code path calls `RecordPathService.buildPath()`; the data-access list behavior is unaffected.
- Focused data-access and affected regression tests pass; the global build is checked and any unrelated pre-existing failures are recorded.

## Verification Note

- Focused data-access regression: 5 suites, 62 tests passed.
- `git diff --check`: passed.
- Global `npm run build`: still blocked by 22 pre-existing TypeScript errors in unrelated role/permission/users code; no reported error points to this plan's changed files.
