---
phase: 3
title: Data service API
status: completed
priority: P1
effort: 1d
dependencies:
  - 2
---

# Phase 3: Data service API

## Overview
Implement contract §B (B1-B11) in `src/modules/data-hub/data-service/` (owned folder) and fill `DataHubDataServiceModule`.

## Key points
- **Read model:** package + its active version + spec + links. Batch-load consumers, users and term counts per page (no N+1).
- **Create:**
  - `service_code` under `pg_advisory_xact_lock(hashtext(prefix))`;
  - version 1 auto-approved;
  - history CREATE.
- **Edit:**
  - `FOR UPDATE` lock on the package;
  - new auto-approved version (`version_no` = max approved + 1, `old_version` = previous);
  - copy nothing: the request body is the full new state;
  - history UPDATE with a field diff;
  - an empty diff → 400 `NO_CHANGES`.
- **Diff:** a pure `data-service-diff.util.ts` driven by a field-meta table (section, label_vi, label_en). User ids display as emails, consumers as codes, terms as physical_column, org ids as codes.
- **Status toggle:** history STATUS.
- **Export:** `exportExcelToResponse`.

## Tests (`__tests__/`)
- **diff util:** scalars, id-list order-insensitive, JSON samples, no-change.
- **code util:** prefix, padding, sequence continues past soft-deleted rows.
- **write service:** create/edit flows with a mocked transaction manager; `SPEC_MISMATCH`; consumers 1-3; invalid ids.
- **query service:** SQL selects explicit columns (no `*`); filters bind params; user refs mapped `{id,email}`.
- **controller:** unauthenticated → 403.

## Success Criteria
- [ ] All B endpoints in Swagger; tsc / eslint / jest green
- [ ] Verified on a scratch schema: create → edit → status → histories/diff → list filters → export
