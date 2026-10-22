---
phase: 1
title: "Migration create data_hub tables"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

<!-- Updated: Validation Session 1 - options table dropped (enums), join tables hard-delete, audit cols no FK -->
<!-- Updated: Validation Session 4 - departments independent of divisions (no division_id) -->
<!-- Updated: Validation Session 3 - widened VARCHAR sizes; form limits enforced in DTOs -->
<!-- Updated: Validation Session 2 - data_hub_ prefix; user ids stored as plain int (no FK); consumer people as columns; service people as per-field link tables -->

# Phase 1: Migration create data_hub tables

## Overview
One migration creating the 16 `data_hub_*` tables in dependency order, with FKs between module tables, NOT NULL/NULL per the brainstorm, CHECKs for enums, and unique indexes. It is idempotent, and `down` drops the tables in reverse order. Diagram: [visuals/data-hub-erd.html](./visuals/data-hub-erd.html).

## Requirements
- **Entity tables** (12):
  - Base columns, same as `2610091700-create-coworker-tables.ts`: `id SERIAL PK`, `created_at`, `updated_at` (TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()), `deleted_at`, `is_deleted BOOLEAN DEFAULT FALSE`.
  - Uniqueness via partial unique index `WHERE deleted_at IS NULL AND is_deleted IS NOT TRUE`.
- **Link tables** (4: `data_hub_data_service_requesters`, `data_hub_data_service_it_supporters`, `data_hub_data_service_consumers`, `data_hub_data_service_physical_terms`):
  - A row is hard-deleted when the link is removed; the old state is kept in history JSONB.
  - Columns `id, created_at, updated_at` only, plus a plain `UNIQUE` constraint.
- **User ids** (`created_by`, `updated_by`, `changed_by`, `user_id`, `so_user_id`, `tech_user_id`, `biz_user_id`):
  - Plain `INT`. **No FK to `users`** and no relation, same as the other modules.
- **FKs between module tables:**
  - Default `REFERENCES … ON DELETE RESTRICT`.
  - Spec and link tables use `ON DELETE CASCADE` from their parent. The parent is only soft-deleted in practice, so the cascade fires only on a manual hard delete.
- **Lengths:** VARCHAR sizes are deliberately wider than the mock form limits so small UI changes need no migration. The form limits are validated in DTOs: service name ≤90, short description ≤400, purpose ≤1000, consumer description ≤200.
- **Enums:** `VARCHAR(50) NOT NULL` + `CHECK (col IN (…))`, named `ck_<table>_<col>`.
- **No filter indexes.**

## Enum values (stored codes; FE maps display labels)

| Column | Values |
|---|---|
| `service_type` | API, SFTP |
| `status` (data services, consumers) | active, inactive |
| `consumers.category` | INTERNAL_APP, PARTNER_ECOSYSTEM |
| `history.action` | CREATE, UPDATE |
| `api.method` | GET, POST, PUT, PATCH, DELETE |
| `api.base_url` | API_INT, API_EXT, API_OPEN, API_UAT, API (→ `api-int.vpbank.com.vn` … `api.vpbank.com.vn`) |
| `api.auth_type` | X_SECRET_KEY, X_IBM_CLIENT_ID, X_IBM_CLIENT_SECRET, CLIENT_ID, BEARER_TOKEN |
| `api.token_auth_method` | BASIC, X_SECRET_KEY, X_IBM_CLIENT_ID |
| `api.update_frequency` | REALTIME, NEAR_REALTIME, DAILY_D1, ADHOC |
| `api.sync_mode` | SYNC, ASYNC, BATCH |
| `sftp.auth_type` | SSH_KEY, PASSWORD |
| `sftp.key_vault_method` | CYBERARK_PAM, LOCAL_KEYSTORE, HSM_VAULT |
| `sftp.file_format` | CSV, CSV_PIPE, PARQUET, XLSX, JSON |
| `sftp.export_frequency` | DAILY_0200, HOURLY, W_1, M_1, ADHOC |
| `sftp.encryption` | PGP_KEY, NONE |
| `sftp.flow_direction` | PUSH, PULL |

## Architecture — tables (create order)

| # | Table | Columns (beyond base) | Constraints |
|---|---|---|---|
| 1 | `data_hub_divisions` | code VARCHAR(100) NN, name VARCHAR(255) NN | UQ code (live) |
| 2 | `data_hub_departments` | code VARCHAR(100) NN, name VARCHAR(255) NN | UQ code (live) |
| 3 | `data_hub_request_units` | code VARCHAR(100) NN, name VARCHAR(255) NN, category VARCHAR(100) NULL | UQ code (live) |
| 4 | `data_hub_consumers` | code VARCHAR(100) NN, name VARCHAR(255) NN, category VARCHAR(50) NN, division_id FK NN, department_id FK NULL, short_description VARCHAR(1000) NN, status VARCHAR(50) NN DEFAULT 'active', so_user_id INT NN, tech_user_id INT NN, biz_user_id INT NULL, created_by INT NN, updated_by INT NULL | UQ code (live); CHECK category, status |
| 5 | `data_hub_logical_terms` | code VARCHAR(255) NN, name VARCHAR(255) NN, short_description VARCHAR(1000) NN, example_value VARCHAR(1000) NULL, created_by NN, updated_by NULL | UQ code (live) |
| 6 | `data_hub_physical_terms` | physical_column VARCHAR(255) NN, technical_description TEXT NN, example_value VARCHAR(1000) NN, logical_term_id FK NULL, created_by NN, updated_by NULL | UQ lower(physical_column) (live) |
| 7 | `data_hub_data_services` | service_code VARCHAR(100) NN, service_type VARCHAR(50) NN, name VARCHAR(255) NN, short_description VARCHAR(1000) NN, purpose VARCHAR(2000) NULL, request_unit_id FK NN, division_id FK NN, department_id FK NN, source_table VARCHAR(1000) NN, usage_guide_html TEXT NN DEFAULT '', status VARCHAR(50) NN DEFAULT 'active', version_no INT NN DEFAULT 1, created_by NN, updated_by NULL | UQ service_code (live); CHECK service_type, status |
| 8 | `data_hub_data_service_api_specs` | data_service_id INT NN FK CASCADE, method VARCHAR(50) NN, base_url VARCHAR(50) NN, endpoint_path VARCHAR(1000) NN, auth_type VARCHAR(50) NN, token_endpoint VARCHAR(1000) NULL, token_auth_method VARCHAR(50) NULL, peak_tps VARCHAR(255) NULL, update_frequency VARCHAR(50) NN, sync_mode VARCHAR(50) NN, timeout VARCHAR(100) NULL | UQ data_service_id (live, 1-1); CHECK each enum |
| 9 | `data_hub_data_service_sftp_specs` | data_service_id INT NN FK CASCADE, host VARCHAR(255) NN, port INT NN DEFAULT 22, auth_type VARCHAR(50) NN, key_vault_method VARCHAR(50) NULL, vault_account VARCHAR(255) NULL, folder_path VARCHAR(1000) NN, file_name_pattern VARCHAR(500) NN, file_format VARCHAR(50) NN, export_frequency VARCHAR(50) NN, max_file_size VARCHAR(255) NULL, encryption VARCHAR(50) NN, flow_direction VARCHAR(50) NN | UQ data_service_id (live, 1-1); CHECK each enum; CHECK port 1–65535 |
| 10 | `data_hub_data_service_histories` | data_service_id FK NN, version_no INT NN, action VARCHAR(50) NN, change_note TEXT NULL, changes JSONB NULL, changed_by INT NN | UQ (data_service_id, version_no); CHECK action |
| 11 | `data_hub_logical_term_histories` | logical_term_id FK NN, version_no NN, action NN, snapshot JSONB NN, changed_by NN | UQ (logical_term_id, version_no); CHECK action |
| 12 | `data_hub_consumer_histories` | consumer_id FK NN, version_no NN, action NN, snapshot JSONB NN, changed_by NN | UQ (consumer_id, version_no); CHECK action |
| 13 | `data_hub_data_service_requesters` *(link)* | data_service_id FK CASCADE NN, user_id INT NN (Đầu mối yêu cầu BU) | UNIQUE (data_service_id, user_id) |
| 14 | `data_hub_data_service_it_supporters` *(link)* | data_service_id FK CASCADE NN, user_id INT NN (IT hỗ trợ) | UNIQUE (data_service_id, user_id) |
| 15 | `data_hub_data_service_consumers` *(link)* | data_service_id FK CASCADE NN, consumer_id FK NN | UNIQUE pair |
| 16 | `data_hub_data_service_physical_terms` *(link)* | data_service_id FK CASCADE NN, physical_term_id FK NN | UNIQUE pair |

History rows are append-only and are never soft-deleted in practice. They still keep the base columns so all entity tables look the same.

## Related Code Files
- Create: `src/migration/2610221500-create-data-hub-tables.ts` (class `CreateDataHubTables2610221500`)

## Implementation Steps
1. Write the migration in coworker style: raw SQL, `CREATE TABLE IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`.
2. Index/constraint names: `uq_<table>_<cols>_live` (partial), `uq_<table>_<cols>` (link), `ck_<table>_<col>`. If a name passes the 63-char Postgres limit, shorten the table part (e.g. `uq_dh_ds_physical_terms_pair`).
3. `down`: `DROP TABLE IF EXISTS` in reverse order (no CASCADE).
4. Comments explain the reason (no plan refs). The file is long, but migrations are exempt from the 200-line rule.

## Success Criteria
- [ ] Up on scratch DB creates 16 tables; re-run up is no-op; down removes all
- [ ] Constraints reject: duplicate live code, bad enum value, port 0, orphan module FK, duplicate link pair; soft-deleted duplicate code is allowed

## Risk Assessment
- Adding an enum value later requires a migration that drops and recreates the CHECK. This trade-off was accepted in validation session 1.
- User ids have no FK, so a deleted or unknown user id is not caught by the DB. The service layer validates ids on create/edit, same as the other modules.
