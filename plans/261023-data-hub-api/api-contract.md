# Data Hub API contract

Base: `/api/v1/data-hub/...`. Every controller uses `@ApiTags`, `@ApiBearerAuth()`, `@UseGuards(BearerGuard)`, and the strict `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })` (as in `coworker.controller.ts`). **No permission codes yet**; the user decided authorization comes later. Each handler checks `req.info?.user?.id`, else `ForbiddenException('User not authenticated')`.

## Global rules (user requirements, MUST)
1. **Select only the columns the response needs.**
   - Use explicit column lists in raw SQL or QueryBuilder `.select([...])`.
   - Never `SELECT *`, never return entities as-is, never select password or other user columns.
2. **Every user reference is returned as `{ id, email }`**, or `null` if the id is null. Resolve with one batched query per request: `SELECT id, email FROM users WHERE id = ANY($1)`. This is the shared `DataHubUserRefService.resolve(ids) → Map<number, {id,email}>`.
   - Fields: `created_by_user`, `updated_by_user`, `submitted_by_user`, `reviewed_by_user`, `changed_by_user`, `business_contacts[]`, `requesters[]`, `it_supporters[]`.
   - An unknown id (user deleted) → `{ id, email: null }`.
3. **Writes validate user ids** exist among live users. Otherwise 400 `INVALID_USERS: <ids>`.
4. **"Live" filter:** `deleted_at IS NULL AND COALESCE(is_deleted,false) = false` on every soft-delete table in every read.
4b. **Relations use "active + live"** (`activeSql(alias)` in `common/data-hub-query.util.ts`). Any consumer or data service reached through a relation must be live and `status = 'active'`. This covers counts, KPI cards, linked lists, the consumers shown on a service row or detail, systems_out, and the `consumer_ids` filter. An entity's own list or detail is the exception: it is filtered by its `status` param, `active` by default, with `inactive` / `all` available. The consumer list API filters by `status`, and the FE consumers drawer exposes it. Added 2026-10-23.
4c. **Default order is newest first:** `created_at DESC, id DESC`. Added 2026-10-26.
   - Applies to:
     - list and export of data services (`sort_by=newest` default, which now uses created_at; the `name` / `code` presets stay available);
     - consumers;
     - logical terms, and the physicals nested in them;
     - physical `/available` and the source-table group lists (dictionary groups newest first, form picker A→Z).
   - Histories and versions were already newest first.
   - Org lookups, the systems-out dropdown and the consumer chips inside a service row stay A→Z for scanning.
5. **Response envelopes:**
   - list → `{ data: [...], meta: { total, page, limit } }`
   - detail → plain object
   - create → `{ id, ... }`
6. **Query DTOs:** every list DTO extends `DataHubPageQueryDto`, which extends the repo-wide `BaseSearchDto` (`src/common/dto/common.dto.ts`), so the params are `keyword`, `page` and `limit`. `keyword` is trimmed, stripped of special characters and capped at 250; it is matched with ILIKE using a bound param, escaping `%` and `_`. `page` defaults to 1 with min 1; `limit` defaults to 10, range 1..100 (the bounds are added on top of the base). The base `sort` object is inherited but unused. Array filters accept `a,b` or repeated params (Transform to number[] / string[]). Changed 2026-10-23: `search` became `keyword`, the default limit changed from 20 to 10, and the data-service `sort` became `sort_by`.
7. **Errors:** Nest exceptions with a `CODE: message` string, e.g. `BadRequestException('INVALID_CONSUMERS: ...')`, `NotFoundException('DATA_SERVICE_NOT_FOUND')`, `ConflictException('CONSUMER_CODE_EXISTS')`. Map PG `23505` by constraint name to 409.
8. **Writes run in `dataSource.transaction`.** History rows are written in the same transaction.
9. **Org/consumer/term references in responses:** `{ id, code, name }` objects.
10. Code style: snake_case response keys, files < 200 lines (split services), and no plan references in comments.
11. **Permissions (2026-10-26)** — details in section P below. Reads (list, detail, export, stats, histories) need only a logged-in user; every write needs its Data Hub code.

---

## P. Permissions (2026-10-26)
Plan: `plans/261026-data-hub-permissions/`. Codes are seeded by migration `2610261000` (module `/data-hub`, ids allocated MAX+1, matched by code).

| Area | Route | Code |
|---|---|---|
| Consumers | `POST /consumers` | `dh_consumer_create` |
| | `PUT /consumers/:id`, `PATCH /consumers/:id/status` | `dh_consumer_update` |
| Logical terms | `POST /logical-terms` | `dh_logical_term_create` |
| | `PUT /logical-terms/:id` | `dh_logical_term_update` |
| Physical terms / source tables | written only through `POST/PUT /data-services` (`source_tables`) | data-service codes + department (2026-10-27: `dh_physical_term_*` codes and the logical import were removed) |
| Data services | `POST /data-services` | `dh_data_service_create` + member of `department_id` |
| | `PUT /data-services/:id`, `PATCH /data-services/:id/status` | `dh_data_service_update` + member of the active version's department (and of the new one when it changes) |
| Department config | `GET /department-configs`, `GET /department-configs/:id` | `dh_department_view` |
| | `POST /department-configs` | `dh_department_create` |
| | `PUT /department-configs/:id`, `GET /:id/member-candidates`, `POST /:id/members`, `DELETE /:id/members/:userId` | `dh_department_update` |
| | `DELETE /department-configs/:id` | `dh_department_delete` |

- Missing code → 403 `PERMISSION_DENIED: <code>`. Department rule → 403 `DEPARTMENT_FORBIDDEN` (checked right after the row lock, before validation/NO_CHANGES). A service whose version has no department can only be written by super_admin.
- super_admin (`users.type = 'super_admin'`) bypasses every check. Only user-client tokens get role codes (an admin-client token has no Data Hub codes).
- Codes come from roles (+ ALLOW data-access exceptions) through the 300s Redis cache; department membership is read live.
- `GET /my-permissions` → `{ is_super_admin, consumer{create,update}, logical_term{create,update}, data_service{create,update}, department{view,create,update,delete} }`.
- `GET /departments/writable?action=create|update` → `{ data:[{id,code,name}] }`: departments the caller is a member of and holds the matching code for; `[]` if none; all live departments for super_admin. `/departments` (all live) is unchanged.
- Detail responses add `is_update` (consumer, logical: role code; data service: update code ∧ member of the active version's department). Physical detail is read-only (no flags).

### Department config (`/v1/data-hub/department-configs`)
- `GET /` (keyword/page/limit, newest first) → `{ data:[{id,code,name,updated_at,member_count}], meta }`.
- `GET /:id` → `{ id, code, name, members:[{id,email,can_create,can_update}], created_by_user, updated_by_user, created_at, updated_at }`. Member rights are the user's current codes ("Không có quyền" when both false).
- `POST /` / `PUT /:id` body `{ code (^[A-Za-z0-9_-]{1,100}$), name(≤255) }`; code unique case-insensitively among live rows → 409 `DEPARTMENT_CODE_EXISTS`; `PUT` with no change → 400 `NO_CHANGES`.
- `DELETE /:id` → soft delete + removes members; 409 `DEPARTMENT_IN_USE` while a live data service (active version) or live consumer uses it. Locks the row FOR UPDATE; data-service and consumer writes take FOR SHARE on the department they use.
- `GET /:id/member-candidates?keyword=` → users holding `dh_data_service_create` or `_update` that are not members yet: `{ data:[{id,email,can_create,can_update}], meta }`.
- `POST /:id/members {user_ids:[1..100 distinct]}` → `{ id, added }` (existing pairs ignored); every id must be a live user holding a data-service right, else 400 `INVALID_MEMBERS: <ids>`.
- `DELETE /:id/members/:userId` → `{ id, user_id, removed:true }` or 404 `MEMBER_NOT_FOUND`.

---

## A. Org lists — `DataHubOrgController` (`/v1/data-hub`)
Changed 2026-10-23: the single `/lookups` endpoint was split per data set, and enums are no longer served by the API.
- **Org lists:** live rows ordered by code, selecting only these columns.
  - `GET /v1/data-hub/divisions` → `{ data:[{id,code,name}] }`
  - `GET /v1/data-hub/departments` → `{ data:[{id,code,name}] }`
  - `GET /v1/data-hub/request-units` → `{ data:[{id,code,name,category}] }`
- **Enum values** (service types, methods, base URLs, frequencies, formats…) are **declared on each side**:
  - BE: `src/modules/databases/data-hub-enums.ts`, which the DB CHECK constraints mirror.
  - FE: `ENUMS` / `LABELS` / `API_BASE_URL_HOSTS` in `data-exchange-api.js`.
  - The two declarations must be kept in sync by hand.
- **User picker:** reuse the existing `GET /api/v1/asset-hub/users?search=&page=&limit=` (`{id,email}`). No new endpoint.
- **Shared KPI** — `GET /v1/data-hub/stats` (`DataHubStatsController`), used by the catalog, consumers and dictionary tabs:
  ```
  { data_services:{ total, api, sftp }, consumers:{ total, internal, partner }, data_terms:{ logical, physical } }
  ```
  - Services count only those that are active, live and have a live active version.
  - Consumers count only those that are active and live.
  - Logical terms count when live; physical terms count when live and owned by an active live service.
  - One SQL query.
  - Changed 2026-10-23: replaces the former per-tab `/data-services/stats`, `/consumers/stats` and `/logical-terms/stats` (B2 / C2 / D2).

## B. Data services — `/v1/data-hub/data-services`
Read model:
- "Current" = the package (live) + its `active_version_id` version + that version's spec + links.
- Lists only include packages with an `active_version_id`.

### B1. `GET /` — list (catalog grid/table)
- **Query:**
  - `keyword` — matches `service_code`, version `name`, `short_description`, `endpoint_path`
  - `service_type` — API | SFTP
  - `status` — active | inactive | all; default active
  - `methods[]`, `flow_directions[]`
  - `division_ids[]`, `department_ids[]`, `request_unit_ids[]`
  - `consumer_ids[]`, `logical_term_ids[]`, `physical_term_ids[]`
  - `update_frequencies[]` (API), `export_frequencies[]` (SFTP), `file_formats[]`
  - `sort_by` — `newest` (default, package `updated_at` desc) | `name` | `code`. Named `sort_by` because `BaseSearchDto.sort` is an object.
  - `page`, `limit`
- **Item:**
  ```
  { id, service_code, service_type, status, version_no, name, short_description,
    division:{id,code,name}, department:{id,code,name}, request_unit:{id,code,name},
    method|null, endpoint_path|null, flow_direction|null, frequency (api update_frequency | sftp export_frequency),
    file_format|null, consumers:[{id,code,name}], term_count, updated_at }
  ```
- Batch-load consumers and term counts for the page ids. No N+1.

### B2. `GET /stats` — removed
Replaced by the shared `GET /v1/data-hub/stats` (section A).

### B3. `GET /export` — XLSX
- Same filters as B1 plus optional `ids[]`. No paging; cap 5000 rows.
- Uses `exportExcelToResponse` with `@Res()`. Sheet `data-services`.
- Columns: STT, Mã DV, Tên, Mô hình, Phương thức/Chiều, Endpoint/Host, Khối, Phòng ban, Đơn vị yêu cầu, Tần suất, Định dạng tệp, App thụ hưởng (codes, comma-separated), Trạng thái, Phiên bản, Ngày cập nhật.

### B4. `GET /:id` — detail
```
{ id, service_code, service_type, status, active_version_id, pending_version_id|null,
  created_by_user, updated_by_user, created_at, updated_at,
  version_active: { id, version_no, state, name, short_description, purpose, usage_guide_html,
    changelog_note, submitted_by_user, reviewed_by_user, reviewed_at, created_at,
    request_unit:{id,code,name}, division:{...}, department:{...},
    api_spec: {...all api spec fields, base_url_host}|null, sftp_spec: {...}|null,
    requesters:[{id,email}], it_supporters:[{id,email}],
    consumers:[{id,code,name,category,short_description,business_contacts:[{id,email}]}], term_count,
    source_tables:[{id,name,description,terms:[{id,code,technical_description,example_value,logical_term:{id,code}|null}]}] } }
```
`source_tables` is the full grouped set of the active version (used to prefill the edit form).
404 `DATA_SERVICE_NOT_FOUND` if the service is not live or has no active version.

### B5. "Từ điển dữ liệu" tab — grouped by source table (2026-10-27)
- `GET /:id/source-tables?keyword&page&limit` → `{ data:[{ id, name, description, term_count, physical_terms:[{ id, code, technical_description, example_value, logical_term }] }], meta }`: tables holding live terms linked to the active version, terms nested (the FE expands rows without another call).
- `GET /:id/source-tables/:sourceTableId/terms` → `{ data:[{ id, code, technical_description, example_value, logical_term:{id,code}|null }] }`.
- The former `GET /:id/terms` was removed.

### B6. `POST /` — create
- **Body:**
  ```
  { service_type, name(≤90), short_description(≤400), purpose?(≤1000), request_unit_id, division_id, department_id,
    usage_guide_html? (optional since 2026-10-28; empty/missing stored as ''), consumer_ids (1..20), requester_user_ids (≥1),
    it_supporter_user_ids (≥1), source_tables?, changelog_note?, api_spec? | sftp_spec? }
  ```
  - `source_tables` (2026-10-27, replaces `source_table` text and `physical_term_ids`): `[{ id?, name(≤255), description?(≤2000), terms:[{ id?, code(≤255), technical_description(≤2000), example_value?(≤1000), logical_term_id?: number|null }] (1..500) }] (≤50)` — the full desired set.
    - Group `id` = existing live table; it must belong to one of the caller's member departments (its own department, or a department whose live services own live terms in it; super_admin: any) or already be used by this service, else 403 `SOURCE_TABLE_FORBIDDEN: <names>` — once saved, the table is also published to the service's department; unknown → 400 `INVALID_SOURCE_TABLES`. `name`/`description` edits apply to it. No `id` → new table in `department_id`.
    - Term `id` = live term of THIS service (may change fields or move table), else 400 `INVALID_PHYSICAL_TERMS`. No `id` → new term. This service's live terms left out are soft-deleted (old versions keep their links).
    - (2026-10-28) Deleted = gone (only history keeps it); inactive applies to data services only. A table holding terms of inactive services only still exists (its name stays taken → 409 on a new table with that name) but no other service can pick or save it (403 `SOURCE_TABLE_FORBIDDEN`, hidden from `/selectable`); the inactive service itself keeps using its own tables. A table left with no live term (from any service) by a save is soft-deleted in the same transaction, so its name is free again.
    - Table names unique system-wide (409 `SOURCE_TABLE_NAME_EXISTS`); codes unique per table (409 `PHYSICAL_CODE_EXISTS: table.code`); in-payload duplicates → 400 `DUPLICATE_SOURCE_TABLES` / `DUPLICATE_PHYSICAL_TERMS` / `DUPLICATE_TERM_CODES: <table>: <codes>`. Case-insensitive.
    - `logical_term_id` maps the term to a live logical term (null = unmapped, absent = keep the current mapping); unknown/deleted → 400 `INVALID_LOGICAL_TERMS: <ids>`. Mapped logical terms whose physicals change (renamed, moved, deleted, re-mapped — both old and new) get a logical history row. Picker: `GET /logical-terms/options`.
  - The spec object must match `service_type`: exactly one present, else 400 `SPEC_MISMATCH`.
  - `api_spec`: `method, base_url, endpoint_path, auth_type, token_endpoint?, token_auth_method?, peak_tps?, update_frequency, sync_mode, timeout?, sample_request?, sample_response?`. The samples are any JSON.
  - `timeout` is required (non-empty, ≤100) when `sync_mode = SYNC`; optional for `ASYNC` / `BATCH` (2026-10-26).
  - `sftp_spec`: `host?, port?(1..65535, default 22), auth_type, key_vault_method?, vault_account?, folder_path?, file_name_pattern?, file_format, export_frequency, max_file_size?, encryption, flow_direction?`.
- **Validation:** every referenced id exists and is live (`INVALID_REQUEST_UNIT`/`INVALID_DIVISION`/`INVALID_DEPARTMENT`/`INVALID_CONSUMERS`/`INVALID_USERS`). Consumers must be active.
- **service_code:** `{API|SFT}-{division.code}-{NNN}`.
  - Take `pg_advisory_xact_lock(hashtext(prefix))`.
  - `NNN` = max existing suffix for that prefix (including soft-deleted rows) + 1, zero-padded to 3.
- **Writes:**
  - package (`created_by`)
  - version 1: `state=approved`, `version_no=1`, `old_version=null`, `submitted_by=reviewed_by=user`, `reviewed_at=now()`
  - spec
  - links
  - `active_version_id`
  - history `CREATE`, with `version_no=1` and `changes` = every non-empty field as `{old:null,new}`
- **Returns:** `{ id, service_code, version_id, version_no }`.

### B7. `PUT /:id` — edit (new version, auto-approved)
- **Body:** same as B6 minus `service_type`; `changelog_note?` (≤2000).
- **Flow:**
  - Lock the package row (`SELECT ... FOR UPDATE`).
  - Build the new version: `version_no = max approved + 1`, `old_version = previous no`, state approved, plus spec and links.
  - Point `active_version_id` at it and set `updated_by`.
  - Write history `UPDATE` with `changes` = diff(previous active snapshot, new snapshot).
- **No-op:** if the diff is empty, return 400 `NO_CHANGES` and write nothing.
- **Diff entry:** `{ section, field, label_vi, label_en, old, new }`.
  - `section`: `general` | `business` | `technical` | `guide` | `links`.
  - Scalars compare by value.
  - Id lists compare sorted. `old`/`new` are display arrays: emails for users, codes for consumers, `table.code — description` for terms (field `physical_terms`).
  - Org ids display as `code`.
  - JSON samples compare with stable stringify.
- Implement in `data-service-diff.util.ts` as a pure function with a unit test. Labels come from one field-meta table.

### B8. `PATCH /:id/status` — `{ status: active|inactive }`
Update the package `status`, then write history `STATUS` (`version_no` = active version_no, `changes=[{section:'general',field:'status',...,old,new}]`). Same status → 400 `NO_CHANGES`.

### B9. `GET /:id/histories` — "Lịch sử phiên bản" tab
`data:[{ id, version_no, action, change_note, change_count, changed_by_user, created_at }]`, newest first, paged.

### B10. `GET /:id/histories/:historyId` — diff modal
`{ id, version_no, action, change_note, changed_by_user, created_at, changes:[...] }`.

### B11. `GET /:id/versions` — kept for future review
`data:[{ id, version_no, old_version, state, changelog_note, submitted_by_user, reviewed_by_user, reviewed_at, created_at }]`.

## C. Dictionary — `/v1/data-hub/logical-terms` and `/v1/data-hub/physical-terms`
**Physical model (2026-10-27):** a physical term belongs to one data service (`data_service_id`) and one source table (`source_table_id`); `code` (was `physical_column`) is unique inside its table; there is no `status`. Physicals are written only from the data-service form (B6/B7). Everywhere a physical is listed or counted it must be live (`liveSql`) and owned by a live service.

Derived "systems out" of a physical term = distinct active consumers linked to the **active version** of **active** data services whose active version links that physical term. A logical term's systems = the union over its physicals.

### C1. `GET /logical-terms` — tree list
- **Query:**
  - `keyword` — logical code/description OR any of its physical codes/technical descriptions
  - `consumer_ids[]` — keep terms having ≥1 physical whose systems_out intersects
  - `page`, `limit`
- **Item:**
  ```
  { id, code, short_description, example_value, systems_out_count,
    physical_terms:[{ id, code, technical_description, example_value, source_table:{id,name}, data_service:{id,service_code}, systems_out:[{id,code,name}] }] }
  ```
- Order by code.

### C2. `GET /logical-terms/stats` — removed
Replaced by the shared `GET /v1/data-hub/stats` (section A).

### C2a. `GET /logical-terms/options?keyword&page&limit`
Light picker for the data-service form: live logical terms A→Z matching code/short description → `{ data:[{ id, code, short_description }], meta }` (2026-10-28).

### C3. `GET /logical-terms/systems-out`
`[{ id, code, name, term_count }]` — the filter dropdown.

### C4. `GET /logical-terms/:id`
C1 item + `version_no, created_by_user, updated_by_user, created_at, updated_at`.

### C5. `POST /logical-terms`
- **Body:** `{ code (≤255, trimmed), short_description(≤400), example_value?, physical_term_ids (≥1) }` (`name` removed 2026-10-26).
- **Physical checks:** the physicals must be live and either unmapped or already mapped to this term; otherwise 400 `PHYSICAL_ALREADY_MAPPED: <codes>`.
- **Writes:** set `logical_term_id` on those physicals, plus history `CREATE` (`version_no=1`, snapshot = `{code,short_description,example_value,physical_terms:[{id,code,source_table}]}`).
- **Conflicts:** 409 `LOGICAL_TERM_CODE_EXISTS`.

### C6. `PUT /logical-terms/:id`
- Same body. Replaces the physical set: removed physicals get `logical_term_id=NULL`.
- `version_no+1`, history `UPDATE` snapshot.
- Unchanged → 400 `NO_CHANGES` (SO ids compare sorted, so a reorder is no change).

### C7. `GET /logical-terms/:id/histories`
`data:[{ id, version_no, action, snapshot, changed_by_user, created_at }]`.

### C8. `GET /logical-terms/export`
XLSX with C1 filters. One row per physical; unmapped physicals at the end. Columns: STT, Mã chuẩn hóa, Mô tả, Bảng nguồn, Thuật ngữ nghiệp vụ (code), Mã dịch vụ, Mô tả kỹ thuật, Ví dụ, Hệ thống đầu ra.

### C9. Import — removed (2026-10-27)
`GET /logical-terms/import-template` and `POST /logical-terms/import` were removed with the physical write APIs.

### C10. Source tables — `/v1/data-hub/source-tables` (read-only)
- `GET /?keyword&department_ids&division_ids&page&limit` — dictionary "Thuật ngữ nghiệp vụ" tab: tables holding live terms of live services, newest first → `{ data:[{ id, name, description, term_count, departments:[{id,code,name}], divisions:[{id,code,name}], physical_terms:[term as in `/:id/terms`] }], meta }`. Terms are nested (one batched query per page) like the physicals of C1, so the FE expands a row without another call. `departments` (Đơn vị phát hành) = the table's creating department + departments of active services' active versions holding its terms; `divisions` (Khối chủ quản) = divisions of those active versions. `department_ids` / `division_ids` (`1,2` or repeated) keep tables whose `departments` / `divisions` include one of them; both given = AND (2026-10-28).
- `GET /:id/terms` → `{ data:[{ id, code, technical_description, example_value, logical_term:{id,code}|null, data_service:{id,service_code,name} }] }`; 404 `SOURCE_TABLE_NOT_FOUND`.
- `GET /selectable?data_service_id?&keyword&page&limit` — data-service form picker, listed without choosing the Đơn vị phát hành: live tables of every department the caller is a member of (super_admin: all) plus the tables `data_service_id` already uses, A→Z → `{ data:[{ id, name, description, term_count, departments:[{id,code,name}], divisions:[{id,code,name}] }], meta }` (2026-10-27; divisions 2026-10-28).

### C10a. `GET /physical-terms/available` — picker for the logical create/edit form
- **Query:** `keyword` (code, description, table name, service code), `logical_term_id?`, `page`, `limit`. Returns live physicals of live services that are unmapped, or already mapped to `logical_term_id` when given.
- **Item:** `{ id, code, technical_description, example_value, logical_term:{id,code}|null, source_table:{id,name}, data_service:{id,service_code,name} }`.

### C10b. `GET /physical-terms/:id` — detail (read-only)
- 404 `PHYSICAL_TERM_NOT_FOUND` when the term or its service is not live. Returns `{ id, code, technical_description, example_value, logical_term:{id,code,short_description}|null, source_table:{id,name,description}, data_service:{id,service_code,service_type,status,name}, systems_out:[{id,code,name}], created_by_user, updated_by_user, created_at, updated_at }`. `systems_out` = active consumers of the owning service's active version.

### C11. Removed (2026-10-27)
`GET /physical-terms` (list), `POST /physical-terms`, `POST /physical-terms/bulk`, `PUT /physical-terms/:id`, `PATCH /physical-terms/:id/status`, `DELETE /physical-terms/:id`.

## D. Consumers — `/v1/data-hub/consumers`
Derived `api_count` / `sftp_count` = active data services whose active version links the consumer, by service_type. `term_count` = distinct live physical terms across those services.

### D1. `GET /` — list
- **Query:**
  - `keyword` — code, name, description
  - `category`
  - `status` — default active, or `all`
  - `division_ids[]`, `logical_term_ids[]`
  - `connection_type` — API | SFTP, meaning ≥1 such service
  - `page`, `limit`
- **Item:**
  ```
  { id, code, name, category, short_description, status, division:{id,code,name}, department|null,
    business_contacts:[{id,email}] (ordered by link id), api_count, sftp_count }
  ```
- Order by code.

### D2. `GET /stats` — removed
Replaced by the shared `GET /v1/data-hub/stats` (section A).

### D3. `GET /export`
XLSX columns: STT, Mã, Tên, Phân loại, Khối, Phòng ban, Số API, Số SFTP, SO, Mô tả, Trạng thái. SO = comma-joined emails.

### D4. `GET /:id`
D1 item + `term_count, version_no, created_by_user, updated_by_user, created_at, updated_at`. The "Dịch vụ kết nối" tab uses B1 with `consumer_ids=<id>`.

### D5. `POST /`
- **Body:** `{ code (^[A-Z0-9_]{2,100}$, uppercased server-side), name, category, division_id, department_id?, short_description(≤200), business_contact_user_ids:number[] }`. Đầu mối liên hệ nghiệp vụ is multi-select: 1-20 distinct user ids, each validated as a live user (400 `INVALID_USERS`), stored in link table `data_hub_consumer_business_contacts` (hard-deleted links). Tech SO and Biz SO were removed on 2026-10-26; the single `so_user_id` became `so_user_ids`, renamed to `business_contact_user_ids` (response `business_contacts`, label "Đầu mối liên hệ nghiệp vụ") on 2026-10-26.
- Status active, `version_no=1`, history `CREATE` snapshot.
- 409 `CONSUMER_CODE_EXISTS`.

### D6. `PUT /:id`
Same body minus `code` (immutable). `business_contact_user_ids` replaces the whole business-contact set. `version_no+1`, history `UPDATE`. Unchanged → 400 `NO_CHANGES`.

### D7. `PATCH /:id/status`
`version_no+1`, history `STATUS`.

### D7a. Terms tab — grouped by source table (2026-10-27)
- `GET /:id/source-tables?keyword&page&limit` → `{ data:[{ id, name, description, term_count, physical_terms:[term + data_service] }], meta }`: tables holding live terms linked to the active version of active live services serving the consumer, terms nested.
- `GET /:id/source-tables/:sourceTableId/terms` → terms with `data_service:{id,service_code,name}`. 404 `CONSUMER_NOT_FOUND`.

### D8. `GET /:id/histories`
`data:[{ id, version_no, action, snapshot, changed_by_user, created_at }]`.

Snapshot shape (consumers): `{ code, name, category, division_id, department_id, short_description, status, business_contact_user_ids }` (`business_contact_user_ids` sorted ascending). Older history rows may still carry `so_user_id` / `tech_user_id` / `biz_user_id`.

## Module layout (`src/modules/data-hub/`)
```
data-hub.module.ts                       imports the 3 feature modules + common (org lists)
common/  data-hub-common.module.ts       exports the shared providers below
         data-hub-user-ref.service.ts    resolve ids → {id,email}; assertUsers(manager, ids)
         data-hub-query.util.ts          LIVE(alias), parse page/limit, escapeLike, toIdArray Transform
         data-hub-pg-error.util.ts       isUniqueViolation(err, constraint?)
         data-hub-org.controller.ts / data-hub-org.service.ts
data-service/  controller(s), *-query.service.ts, *-write.service.ts, *-history.service.ts, *-export.service.ts,
               data-service-code.util.ts, data-service-diff.util.ts, dto/, __tests__/
dictionary/    logical-term.controller.ts, physical-term.controller.ts (read-only), source-table.controller.ts, *-query/-write/-export services, dto/, __tests__/
               (physical/source-table writes live in data-service/data-service-source-tables.util.ts)
consumer/      controller, query/write/export services, dto/, __tests__/
```
Register `DataHubModule` in `src/app.module.ts`.
