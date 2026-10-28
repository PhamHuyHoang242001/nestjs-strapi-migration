---
title: Data Hub source tables (bảng nguồn) and service-owned physical terms
description: >-
  Physical terms belong to one data service and are grouped by department-scoped
  source tables; created/edited/deleted only from the data-service form; grouped
  read APIs.
status: completed
priority: P1
branch: main
tags:
  - data-hub
  - dictionary
  - data-service
blockedBy: []
blocks: []
created: '2026-10-27T15:25:47.614Z'
createdBy: 'ck:plan'
source: skill
---

# Data Hub source tables (bảng nguồn) and service-owned physical terms

## Decisions (user-confirmed 2026-10-27)
- New table `data_hub_source_tables` (Bảng nguồn dịch vụ): `name` required, unique system-wide (case-insensitive, live rows); `description` optional; `link` kept in DB but unused (always null, FE has no input); `department_id` = department of the service that created it.
- `data_hub_physical_terms`: `physical_column` → `code`; unique only inside one source table; add `source_table_id` + `data_service_id` (1 service : n physicals); drop `status` (+ status API); delete = soft delete. `logical_term_id` stays (mapped from the logical form only).
- Version link table `data_hub_data_service_version_physical_terms` stays: each version lists its physicals; soft-deleted physicals stay on old versions and can't be picked again.
- `data_hub_data_service_versions.source_table` (text) is dropped.
- Source table department scope = its `department_id` ∪ departments (active version) of live services owning live physicals in it. A service may use a table in the scope of its Đơn vị phát hành, or one it already uses (so moving department carries the table along → "published" to both departments while old ones still use it).
- Physical terms + source tables are written only from the data-service create/edit form, under data-service permissions (create / update + department). Codes `dh_physical_term_create/update/delete` are removed.
- Dictionary physical tab: read-only, grouped by source table (paged groups, click → terms). Physical detail read-only. Logical form still picks physicals (shown with source table + service).
- Excel import (logical + physical) removed for now.
- Old data: not migrated; seed new data in the new model.

## API contract
Write (`POST/PUT /v1/data-hub/data-services`): body drops `source_table`, `physical_term_ids`; adds
`source_tables: [{ id?, name, description?, terms: [{ id?, code, technical_description, example_value? }] }]` (0..50 groups, 0..500 terms each).
- `id` given → existing live table (must be in scope of `department_id` or already used by this service); `name`/`description` updates it. No `id` → new table (`department_id` = service department).
- term `id` given → existing live term of THIS service (may move table / change fields); no `id` → new term. This service's live terms missing from the body are soft-deleted.
- Errors: 400 `DUPLICATE_SOURCE_TABLES`, 400 `DUPLICATE_TERM_CODES: <table>: <codes>`, 400 `INVALID_SOURCE_TABLES`, 400 `INVALID_PHYSICAL_TERMS`, 403 `SOURCE_TABLE_FORBIDDEN`, 409 `SOURCE_TABLE_NAME_EXISTS`, 409 `PHYSICAL_CODE_EXISTS`.
- History diff field `physical_terms` labels `table.code` and changes when a term's fields change.

Read:
- DS detail: `version_active.source_tables: [{ id, name, description, terms: [...] }]` (full, for the edit form) + `term_count`.
- `GET /data-services/:id/source-tables?keyword&page&limit` → `{ data: [{ id, name, description, term_count }], meta }`; `GET /data-services/:id/source-tables/:sourceTableId/terms` → `{ data: [term] }`.
- `GET /consumers/:id/source-tables` / `.../:sourceTableId/terms` (terms of active services serving the consumer; term carries `data_service {id, service_code, name}`).
- `GET /source-tables?keyword&page&limit` (dictionary) → `{ id, name, description, term_count, departments:[{id,code,name}], updated_at }`; `GET /source-tables/:id/terms`.
- `GET /source-tables/selectable?department_id&data_service_id&keyword&page&limit` (form picker).
- term item: `{ id, code, technical_description, example_value, logical_term:{id,code}|null }` (+ `data_service`, `source_table` where context needs it).
- Removed: `POST/PUT/PATCH/DELETE /physical-terms*`, `POST /physical-terms/bulk`, `GET /physical-terms` (list), `GET /data-services/:id/terms`, logical import + template.

## Phases
| Phase | Name | Status |
|-------|------|--------|
| 1 | [Schema migration and entities](./phase-01-schema-migration-and-entities.md) | Completed |
| 2 | [Data service write with source tables and terms](./phase-02-data-service-write-with-source-tables-and-terms.md) | Completed |
| 3 | [Grouped read APIs and dictionary cleanup](./phase-03-grouped-read-apis-and-dictionary-cleanup.md) | Completed |
| 4 | [Permissions cleanup](./phase-04-permissions-cleanup.md) | Completed |
| 5 | [FE changes](./phase-05-fe-changes.md) | Completed |
| 6 | [Seed data and verification](./phase-06-seed-data-and-verification.md) | Completed |

## Dependencies
- Builds on uncommitted Data Hub module + permissions (`plans/261026-data-hub-permissions`).
