---
phase: 1
title: DB package-version rework
status: completed
priority: P1
effort: 2h
dependencies: []
---

# Phase 1: DB package-version rework

## Overview
Rewrite migration `2610221500-create-data-hub-tables.ts` and the entities so data services follow the package + version model. The ERD is at `plans/261022-data-exchange-db-schema/visuals/data-hub-erd.html`.

## Changes
- **`data_hub_data_services` → package:**
  - Keeps `service_code`, `service_type`, `status`, `active_version_id` (FK ON DELETE SET NULL), `created_by`, `updated_by`.
- **New `data_hub_data_service_versions`:**
  - All content columns, plus `version_no`, `old_version`, `state`, `changelog_note`, `submitted_by`, `reviewed_by`, `reviewed_at`, `reject_reason`. (`usage_guide_markdown` was added then removed on 2026-10-23: the mock only copied the HTML into it, so it held no separate data.)
  - Partial unique indexes: one pending version per service; approved `version_no` never repeats.
- **Specs and link tables move to the version level:**
  - specs: `..._version_api_specs` (+ `sample_request` / `sample_response` JSONB), `..._version_sftp_specs` (4 columns become nullable);
  - links: `..._version_requesters`, `..._version_it_supporters`, `..._version_consumers`, `..._version_physical_terms`.
- **`data_hub_data_service_histories`:**
  - `+ data_service_version_id`; `version_no` becomes nullable;
  - action `CREATE | UPDATE | STATUS`;
  - no unique index (STATUS rows share a version_no).
- **`data_hub_consumers` / `data_hub_logical_terms`:**
  - `+ version_no` (default 1), used as the history counter;
  - consumer history action adds `STATUS`.
- **Enums:** `DataHubVersionState`, `DataHubServiceHistoryAction`.

## Success Criteria
- [ ] 17 tables; up → re-up → down → up OK on a scratch schema
- [ ] one-pending and approved-version_no uniques enforced
- [ ] version delete cascades to links; `active_version_id` becomes NULL when its version is removed
- [ ] 17 entities load; 0 drift vs DB (185 columns)
- [ ] tsc + eslint clean
