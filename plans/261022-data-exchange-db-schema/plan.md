---
title: "Data Exchange DB schema"
description: "Create the data_hub_* tables for Data Services (API/SFTP), data dictionary (logical/physical) and consumer apps, with entities and enums."
status: pending
priority: P2
branch: "main"
tags: [backend, database, migration, data-exchange]
blockedBy: []
blocks: []
created: "2026-10-22T09:02:51.927Z"
createdBy: "ck:plan"
source: skill
---

# Data Exchange DB schema

## Overview

Database layer only for the new Data Exchange module (mock: `Mock-EDA-Portal/data-exchange/`). It adds 16 tables prefixed `data_hub_` and TypeORM entities + enums. **No API / service / controller in this plan**; those come in the next plan.

Diagram: [visuals/data-hub-erd.html](./visuals/data-hub-erd.html).

Source of truth: [brainstorm report](../reports/brainstorm-261022-data-exchange-db-design.md) (ERD + locked decisions). The Validation Log below overrides it where they conflict.

## Key decisions

- **Data Service:**
  - Direct edit, no approval.
  - `data_hub_data_service_histories` stores 1 row per edit, with JSONB `changes` (changed fields only).
  - `data_hub_data_services` holds only the fields present in BOTH create forms. API/SFTP fields go in 1-1 `data_hub_data_service_api_specs` / `data_hub_data_service_sftp_specs`, nullable where the form allows empty.
- **Dictionary:**
  - Logical 1-N physical (`logical_term_id` may be NULL), no approval.
  - Logical history = JSONB snapshot including the attached physicals.
- **Consumers:** no approval; history = JSONB snapshot.
- **Links:**
  - N-N: service↔physical, service↔consumer.
  - Data service people (multi-select): `data_hub_data_service_requesters` (Đầu mối yêu cầu BU), `data_hub_data_service_it_supporters` (IT hỗ trợ).
  - Consumer people (1 each): columns `so_user_id`, `tech_user_id`, `biz_user_id` (null) on `data_hub_consumers`.
  - Join rows are **hard-deleted**.
- **Org data:** `data_hub_divisions` and `data_hub_departments` (shared, independent of each other) and `data_hub_request_units` are tables.
- **Technical lists** (method, auth, frequency, format…) are **enums** (VARCHAR + CHECK); there is no options table.
- **User ids** (`created_by`, `updated_by`, `changed_by`, `user_id`, `*_user_id`): plain INT, no FK/relation to `users`, same as other modules.
- **Derived, not stored:** term systems in/out, consumer API/SFTP/term counts.
- **Left out:** no business-domain table, no draft status, **no filter indexes** (only the unique indexes needed for data correctness).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Migration create data_hub tables](./phase-01-migration-create-data-hub-tables.md) | Pending |
| 2 | [TypeORM entities and enums](./phase-02-typeorm-entities-and-enums.md) | Pending |
| 3 | [Verify and docs](./phase-03-verify-and-docs.md) | Pending |

## Dependencies

- No overlapping unfinished plan (scan 2026-10-22).
- Constraints:
  - No auto-format (`eslint --fix`/prettier).
  - The local DB has no `migrations` table, so never run `typeorm:run` locally; verify on a scratch DB.

## Open (not blocking)

- Real seed data for divisions / departments / request units (the mock lists are inconsistent). Ops will supply it; the tables are created empty.

## Validation Log

### Session 1 — 2026-10-22

#### Verification Results
- Claims checked: 8 | Verified: 8 | Failed: 0 | Unverified: 0 | Tier: Standard
- Verified:
  - migration style (`src/migration/2610091700-create-coworker-tables.ts:8-26`)
  - `users` table (`src/modules/databases/user.entity.ts:13`)
  - entity glob (`src/configuration/orm.config.ts:14`)
  - `BaseColumn` declares `id` (`src/configuration/base-entity/base-column.entity.ts`)
  - JSONB precedent (`ai-app-history.entity.ts`)
  - latest migration `2610141900` < `2610221500`
  - existing seeders (`src/seeders/`) and data migrations (`1784990001000-add-api-catalog-permissions.ts`)
- Deviation found: coworker `created_by` has no FK, but the draft plan added one. Asked the user (Q1).

#### Questions & answers

| # | Question | Answer |
|---|---|---|
| 1 | FK `users` on audit columns? | **No FK** (coworker convention). `user_id` in join tables keeps its FK. |
| 2 | How to unlink N-N rows? | **Hard-delete** the join row. Join tables drop `deleted_at`/`is_deleted` and use a plain UNIQUE. |
| 3 | Where to seed `dx_options`? | Migration. This became moot after Q4. |
| 4 | DB can't stop an option from the wrong group | User: "mấy cái đơn giản như method thì để enum thôi" → **all 12 technical groups become enums; `dx_options` and the seed phase are dropped**. This reverses brainstorm decision #10 at the user's request. |

#### Propagation
- Phase 1 rewritten:
  - 16 tables
  - enum columns + CHECKs
  - join tables without soft delete
  - audit columns without FK
- Phase 2:
  - no `DxOption` entity
  - 12 technical enums
  - join entities extend `BaseColumn`
- Old Phase 3 (seed) deleted; old Phase 4 renumbered to Phase 3, with enum and join probes added.
- Brainstorm report header got a "Superseded" note.

#### Whole-Plan Consistency Sweep
- Re-read plan.md + 3 phases; grep for stale terms (`dx_options`, `*_id` option FKs, `17 tables`, seed phase, `phase-04`, `DxOption`).
- All remaining hits are historical log entries or Superseded notes.
- Table count 16 consistent across plan/phase 1/phase 2; phase deps 1→2→3 consistent.
- **Unresolved contradictions: 0.**

### Session 2 — 2026-10-22

#### Questions & answers

| # | Question | Answer |
|---|---|---|
| 1 | Table prefix | `data_hub_` + full name; the service group becomes `data_hub_data_service*` (e.g. `dx_services` → `data_hub_data_services`). FK column `service_id` → `data_service_id`. |
| 2 | Relations to users | User: "chỉ lưu id của user thôi… tương tự như ở các bảng khác". All user ids are plain INT, with no FK to `users` (this reverses session 1 Q1, where `user_id` in link tables had an FK). |
| 3 | People tables | Consumer SO/Tech/Biz are single → columns on `data_hub_consumers`, and `dx_consumer_users` is dropped. Data service BU/IT support are multi-select → keep link tables, named after the field (`..._requesters`, `..._it_supporters`), with the `role` column dropped. |
| 4 | Diagram | Each line must start from the exact FK field. Custom HTML diagram at `visuals/data-hub-erd.html` replaces the mermaid version. |

#### Propagation
- Phase 1 rewritten and renamed to `phase-01-migration-create-data-hub-tables.md`:
  - new names
  - consumer people columns
  - 2 per-field link tables
  - no user FK
  - migration `2610221500-create-data-hub-tables.ts`
- Phase 2: `DataHub*` classes, `data-hub-*.entity.ts`, `data-hub-enums.ts`; role enums dropped.
- Phase 3: `data_hub_%` drift check.
- Table count stays 16 (−`dx_service_users` −`dx_consumer_users` +requesters +it_supporters).

#### Whole-Plan Consistency Sweep
- Grep across plan + 3 phases for `dx_`, `dx-`, `Dx*`, `service_users`, `consumer_users`, `role`, `FK users`: only historical log entries remain.
- Table count 16 consistent (plan, phase 1 table, phase 2 file list); phase links valid.
- **Unresolved contradictions: 0.**

### Session 3 — 2026-10-22
- The user asked to make the length-limited VARCHARs a bit wider. Applied in phase 1 and the diagram:
  - enums → 50
  - codes → 100 (logical term code → 255)
  - names → 255
  - descriptions → 1000; purpose → 2000
  - paths, URLs, source table, example value → 1000
  - `file_name_pattern` → 500
  - `peak_tps`, `max_file_size`, `vault_account`, `physical_column` → 255
  - `timeout` → 100
  - `request_units.category` → 100
- Form limits from the mock stay as DTO validation, not DB limits.

### Session 4 — 2026-10-22
- User: divisions and departments are independent → removed `data_hub_departments.division_id` (phase 1 + diagram). Data services and consumers still reference both separately.
