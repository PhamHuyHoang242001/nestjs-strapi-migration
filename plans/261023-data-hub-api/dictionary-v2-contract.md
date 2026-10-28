# Dictionary v2: separate logical / physical management + physical status & delete

Decided by the user on 2026-10-23:
- Logical and physical terms each get a full list, detail, create and edit, managed separately.
- Create and edit can link the two in either direction:
  - a logical picks its physicals;
  - a physical picks its logical.
- **Only physical terms get `status`** (`active | inactive`), with an activate / deactivate API.
- Physical terms can be deleted with a **soft delete, allowed even when a data service uses the term**. The service keeps the old link in its version and history; read paths simply stop showing it.
- Everywhere else, a physical term counts or is listed only when it is **live AND active**.
- FE: the dictionary page has 2 tabs (logical / physical). Each kind has its own detail page. Create and edit share one form page (`?id=&mode=edit`), as data services do.

Global rules from `api-contract.md` still apply:
- select only needed columns;
- user refs as `{id,email}`;
- list DTOs extend `DataHubPageQueryDto` (keyword / page / limit);
- `{data, meta}` envelope;
- `CODE: message` errors;
- writes in a transaction;
- no permission codes (Bearer only).

## 1. DB
- Migration `src/migration/2610221500-create-data-hub-tables.ts`, table `data_hub_physical_terms`:
  - add `status VARCHAR(50) NOT NULL DEFAULT 'active'`;
  - add `CONSTRAINT ck_data_hub_physical_terms_status CHECK (status IN ('active','inactive'))`.
  - The migration is not committed yet, so edit the file. Then apply to the local DB with an idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`, and add the constraint only if missing.
- Entity `data-hub-physical-term.entity.ts`: add `status: DataHubStatus`, default ACTIVE.
- Add a shared SQL helper. `activeSql(alias)` in `common/data-hub-query.util.ts` already means live + `status='active'` and works for physical terms too; reuse it.

## 2. Physical API (`/v1/data-hub/physical-terms`)
Declare static routes before `:id`.

| Method & path | Purpose |
|---|---|
| `GET /` | Management list |
| `GET /available` | Picker for the logical create/edit form |
| `GET /:id` | Detail |
| `POST /` | Create one |
| `POST /bulk` | Bulk create/upsert (keep the existing one; new rows are active) |
| `PUT /:id` | Edit |
| `PATCH /:id/status` | Activate / deactivate |
| `DELETE /:id` | Soft delete |

**`GET /` — management list.** Query:
- `keyword`: matches column or technical description
- `status`: `active | inactive | all`, default `all`
- `mapping`: `mapped | unmapped | all`, default `all`
- `logical_term_id`
- `page`, `limit`

Item:
```
{ id, physical_column, technical_description, example_value, status, logical_term:{id,code}|null,
  data_service_count, updated_at }
```
`data_service_count` = active live data services whose active version links this physical.

**`GET /available` — picker for the logical create/edit form.** Query: `keyword`, `logical_term_id?`, `page`, `limit`.
- Returns **active, live** physicals that are unmapped, OR already mapped to `logical_term_id` when it is given (the edit case).
- Item: `{ id, physical_column, technical_description, example_value, logical_term:{id,code}|null }`.

**`GET /:id` — detail.** 404 `PHYSICAL_TERM_NOT_FOUND` when not live. Returns:
```
{ id, physical_column, technical_description, example_value, status,
  logical_term:{id,code,short_description}|null,
  data_services:[{id, service_code, service_type, name}],   // active live services, via their active version
  systems_out:[{id, code, name}],                            // active live consumers of those services
  created_by_user, updated_by_user, created_at, updated_at }
```

**`POST /` — create one.**
- Body: `{ physical_column(≤255), technical_description, example_value, logical_term_id? }`.
- The new row is active.
- 409 `PHYSICAL_COLUMN_EXISTS`.
- If mapped, write a logical history snapshot (`version_no+1`, UPDATE).
- Returns `{ id }`.

**`PUT /:id` — edit.**
- Body: `{ physical_column, technical_description, example_value, logical_term_id|null }`.
- Same rules as the existing PUT: `NO_CHANGES`, mapping history for the old and new logical.

**`PATCH /:id/status` — activate / deactivate.**
- Body: `{ status: active|inactive }`.
- Same status → 400 `NO_CHANGES`.
- Returns `{ id, status }`.
- If the physical is mapped, write a logical history snapshot (`version_no+1`, UPDATE), because the snapshot lists physicals with their status.

**`DELETE /:id` — soft delete.**
- Sets `deleted_at = NOW(), is_deleted = true`.
- Allowed even when services use it.
- If mapped, write the logical history snapshot first, so the physical disappears from the logical.
- Returns `{ id, deleted: true }`.
- 404 when not live.

## 3. Logical API (`/v1/data-hub/logical-terms`)
Logical terms keep live-only semantics (no status).

**`GET /` — tree list.** The nested `physical_terms` show **active** live physicals only. `systems_out` and `systems_out_count` also use active physicals.

**`GET /:id` — detail.**
- Lists **all live** physicals of this logical, each with its `status`.
- `systems_out` uses active physicals only.
- Plus the existing fields.

**`POST` / `PUT` — create / edit.**
- `physical_term_ids` must be live.
- A physical that is **newly** attached must be **active**, else 400 `PHYSICAL_INACTIVE: <columns>`. Physicals already attached may stay even if inactive.
- The mapping-conflict rule is unchanged.

**History snapshot.** `physical_terms:[{id, physical_column, status}]` (add `status`).

**Removed.** `GET /logical-terms/stats` is already gone; use `/v1/data-hub/stats`.

## 4. "Active physical only" everywhere else
All of these must use `activeSql('pt')`, replacing the live-only filter, for physical terms:
- **Data service**
  - terms tab (`/data-services/:id/terms`): list and count;
  - `term_count` in the list (`loadPageRelations`) and in the detail;
  - list filters `physical_term_ids` / `logical_term_ids`;
  - create/edit validation: `INVALID_PHYSICAL_TERMS` when a physical is not live **or not active**. The diff snapshot loader (non-strict) stays as it is.
- **Dictionary:** `SYSTEMS_OUT_PAIRS_SQL` (join `data_hub_physical_terms` active).
- **Consumer:** `term_count` and the `logical_term_ids` filter (via physical).
- **Shared stats:** `data_terms.physical` counts active live physicals.
- **Export:** logical-terms export uses only active physicals.

## 5. Tests
- Update the existing specs.
- Add specs for:
  - the new physical endpoints (list filters, available, detail, create, status, delete with history);
  - the inactive-physical rule in logical writes;
  - active filters in data-service, consumer and systems-out SQL.
- Each new test must fail without the change.

## 6. FE (`/Users/phamhoang/Documents/project-1/Mock-EDA-Portal-api-test/data-exchange/`)
**`data-exchange-terms.html`** gets 2 tabs.
- **Tab 1 "Thuật ngữ chuẩn hoá" (logical):** the existing tree list.
  - Each row links to the logical detail.
  - Header button "Tạo thuật ngữ chuẩn hoá" opens `data-exchange-term-create.html`.
- **Tab 2 "Thuật ngữ nghiệp vụ" (physical):** a table with columns Column, Mô tả kỹ thuật, Ví dụ, Thuật ngữ chuẩn hoá (link), Số service dùng, Trạng thái badge, Thao tác.
  - Actions: view, edit, activate/deactivate, delete, with confirm.
  - Filters: keyword, status (all/active/inactive), mapping (all/mapped/unmapped). Paging.
  - Header button "Tạo thuật ngữ nghiệp vụ" opens `data-exchange-business-term-create.html`.
- The active tab is kept in `?tab=logical|physical`.

**New `data-exchange-logical-term-detail.html?id=`**
- Shows info, the physical list (with status badges, linking to physical detail), systems_out, and the history list.
- Buttons "Sửa" → `data-exchange-term-create.html?id=&mode=edit`, and "Quay lại".

**New `data-exchange-physical-term-detail.html?id=`**
- Shows info, status badge plus a toggle, the linked logical (link), the data services using it (link to service detail), systems_out, and created/updated by email.
- Buttons "Sửa" → `data-exchange-business-term-create.html?id=&mode=edit`, "Xoá" (confirm, then back to `terms.html?tab=physical`), and "Quay lại".

**`data-exchange-term-create.html`** (logical create/edit)
- Edit mode loads `GET /logical-terms/:id` and prefills.
- The physical picker uses `GET /physical-terms/available?logical_term_id=<id when editing>`.
- Submit with POST, or PUT in edit mode.

**`data-exchange-business-term-create.html`** (physical)
- Create mode keeps the bulk table (`POST /bulk`).
- Edit mode (`?id=&mode=edit`) shows a single-row form filled from `GET /physical-terms/:id`, with a logical picker (`GET /logical-terms`), then PUT.

**Everywhere:** show a 409, 400 or 404 message toast via `api.showError`. Keep the existing visual style.

## 7. Uniqueness (2026-10-26)
- Logical `code` is unique among live rows, **case-insensitively**. The same applies to physical `physical_column`.
- Logical terms have **no `name`** (removed 2026-10-26): fields are `code`, `short_description`, `example_value`, mirroring physical (`physical_column`, `technical_description`, `example_value`). `LOGICAL_TERM_NAME_EXISTS` and the logical-name import rule are gone.
- The indexes use `LOWER(col COLLATE "und-x-icu")` when the ICU collation exists. With a C/POSIX DB locale, plain `LOWER()` folds ASCII only, so `MÃ` ≠ `mã`. Without ICU the indexes fall back to plain `LOWER()`.
- Errors:
  - 409 `LOGICAL_TERM_CODE_EXISTS`
  - 409 `PHYSICAL_COLUMN_EXISTS`
  - 400 `DUPLICATE_PHYSICAL_COLUMNS` (same column twice in one bulk payload)
- Import:
  - rows group logical codes case-insensitively;
  - a code that matches a stored term in a different case updates that term;
- FE `showError` maps these codes to Vietnamese text.
