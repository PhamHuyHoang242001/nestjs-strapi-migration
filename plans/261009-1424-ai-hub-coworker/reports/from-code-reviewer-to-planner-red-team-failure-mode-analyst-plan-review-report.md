# Red-team plan review — Failure Mode Analyst / Flow Tracer

**Plan:** `plans/261009-1424-ai-hub-coworker/`
**Role:** Hostile reviewer. Murphy's Law: races, data loss, cascading failures, deploy/rollback.
**Verification:** Flow Tracer — claimed entry → PermissionGuard → service branch → target. Claims checked against codebase (grep/read). No lint/build/test.
**Verdict:** Plan is not production-safe as written. Do not cook until the Critical/High items below are rewritten with explicit predicates, deploy order, and rollback SQL.

Traced live paths (prompt = representative of 3 WS; skill/api-catalog are the same shape):

| Claimed API | Guard today | Service today |
|---|---|---|
| `PUT .../items/:id/versions` | `*_upload` only | `canApprove \|\| created_by` then pending unique |
| `PUT .../versions/:vid` | `*_upload` OR `*_approve` | `approverPending` bypasses newest-rejected |
| `PATCH .../items/:id/status` | `*_approve` only | **no userId, no ownership** |

---

## Finding 1: Phase 3 registers `coworker_packages` in the data-access graph before the table exists

- **Severity:** Critical
- **Location:** Phase 3, section "Architecture" (`coworker_packages` table chưa có — vẫn insert module row); Phase 4 owns CREATE TABLE
- **Flaw:** Same phase adds `coworker_packages` to `HIERARCHY_MAP` (therefore `ALLOWED_TABLES`), `OWNER_ALL_TABLES`, `ROOT_OWNER_CONFIG`, and inserts `modules.table_name='coworker_packages'`. The table is created in phase 4. Every records-browser / owner-picker path interpolates `FROM "${tableName}"` with no existence guard.
- **Failure scenario:** Ship phase 3 alone (or migrate 3 then crash before 4). Super-admin opens records browser, or owner-assignment UI lists roots for the new `ai_hub_coworker` type. Postgres: `relation "coworker_packages" does not exist`. That 500 is not isolated — `getRecords` for a newly listed module is a normal admin click after the module row appears. Rollback of phase 3 without deleting the hierarchy keys leaves the same crash if config shipped ahead of DB.
- **Evidence:**
  - Plan: phase-03 Architecture lines 32, 34 (`HIERARCHY_MAP` 4 keys; insert module `table_name='coworker_packages'` before table).
  - `ALLOWED_TABLES` is `Object.keys(HIERARCHY_MAP)` — `src/modules/data-access/constants/hierarchy-config.ts:47`
  - `getRecords` allows any `ALLOWED_TABLES` member; super_admin → `getUnscopedRecords` — `src/modules/data-access/data-access.service.ts:1223-1240`
  - `getUnscopedRecords` runs `SELECT ... FROM "${tableName}"` — `src/modules/data-access/data-access.service.ts:1356-1394`
  - `getScopedRecords` own-all branch also calls `getUnscopedRecords` — `src/modules/data-access/data-access.service.ts:1436-1441`
  - `RoleService.listOwnerResources` runs `SELECT ... FROM "${tableName}"` once `ROOT_OWNER_CONFIG[tableName]` exists — `src/modules/role/role.service.ts:81-105`
- **Suggested fix:** Do not put `coworker_packages` in `HIERARCHY_MAP` / `OWNER_ALL_TABLES` / `ROOT_OWNER_CONFIG` / `modules.table_name` until the CREATE TABLE migration has run in the **same** deploy unit. Split phase 3: (a) skill/prompt/api-catalog modules only; (b) coworker module+config in phase 4 after DDL. Add a cook checklist: `psql \dt coworker_packages` before any process loads the new config.

---

## Finding 2: `replaceSupporters` soft-delete plan fights TypeORM and the live unique/read predicates — revoked supporters still bump

- **Severity:** Critical
- **Location:** Phase 1, sections "Requirements", "TDD red", "Green" (`soft-delete` + `TypeORM` + unique `WHERE deleted_at IS NULL` + `assertUsers` / replace); Phase 2 "Load supporter ids trong canBump"
- **Flaw:** The repo already documents two delete paths: TypeORM `softDelete` sets **only** `deleted_at`; other writers set **only** `is_deleted`. Every production read that matters checks **both**. Phase 1 tells cook to use `BaseSoftDeleteEntity` + TypeORM soft-delete + unique on `deleted_at IS NULL` only, and never specifies the `canBump` SELECT predicate. Existing PIC/supporter replace on diagnostic reports is **hard** `manager.delete`, not soft-delete. `replaceResponsibles` (the function this plan says to sit next to) is also hard-delete.
- **Failure scenario:** Cook follows Phase 1 literally: `repository.softDelete` old rows, insert new. Unique on `deleted_at IS NULL` allows re-insert. Then `canBump` / `listSupporters` is written like every AI Hub finder (`where: { is_deleted: false }` or raw `is_deleted = false`). Revoked supporter rows still have `is_deleted=false`. User is removed in the UI, still passes `canBump`, still `PUT` versions on a live skill/prompt/api-catalog package. Inverse failure: unique cloned as `WHERE is_deleted = false` (the pending-index shape) → TypeORM-soft-deleted row still occupies the unique slot → re-adding the same supporter 23505, replace aborts mid-tx, PIC replace already committed or not depending on order → partial metadata write.
- **Evidence:**
  - Two-path delete contract — `src/common/authorization/services/owner-scope-resolver.service.ts:14-18`
  - `@DeleteDateColumn` only; `is_deleted` is a separate column — `src/configuration/base-entity/base-soft-delete.entity.ts:5-13`
  - Diagnostic writers set **both** columns and comment why — `src/modules/bi-hub-diagnostic-report/bi-hub-diagnostic-report-write.service.ts:258-262`
  - Diagnostic `replaceSupporters` is **hard delete** — `src/modules/bi-hub-diagnostic-report/bi-hub-diagnostic-report-write.service.ts:234-250`
  - AI Hub PIC replace is **hard delete** — `src/modules/asset-hub-catalog/asset-hub-item-meta.service.ts:135-149`
  - Live package/version loads filter `is_deleted: false` only (TypeORM-soft-deleted rows still load) — `src/modules/prompt-library/prompt-library-upload.service.ts:130, 231-234`
- **Suggested fix:** Pick one and write it in the phase, not "TypeORM soft-delete" and "giống PIC" at once. Recommended: hard-delete like `replaceResponsibles` / diagnostic `replaceSupporters` (no unique ghost). If soft-delete is mandatory: `UPDATE ... SET deleted_at=NOW(), is_deleted=true` then insert; unique **and** every reader use `deleted_at IS NULL AND is_deleted IS NOT TRUE`; add a spec that a soft-deleted supporter cannot `canBump`. Call `replaceSupporters` only inside the existing `SELECT id FROM *_packages WHERE id=$1 FOR UPDATE` tx (`prompt-library-upload.service.ts:167, 270`).

---

## Finding 3: Phase 1 reuses `assertUsers`, which 400s on empty — create/`[]` clear are dead on arrival

- **Severity:** High
- **Location:** Phase 1, section "Green" step 3; Phase 2, section "Related Code Files" / "Omit vs required"
- **Flaw:** Phase 1: `replaceSupporters(...) — assert users qua assertUsers sẵn có`. `assertUsers` throws if the deduped list is empty (`at least one person in charge is required`). Phase 2: create omit → default `[]`; bump omit → keep; bump `[]` → clear all. Those two sentences cannot be implemented against the current helper.
- **Failure scenario:** First create with no supporters (the documented default) calls `assertUsers([])` → 400 `INVALID_RESPONSIBLE_USERS` on **three live workspaces** the moment Phase 2 wires the field. Owner tries to clear supporters by sending `[]` → same 400; stale supporters remain; `canBump` still true for people who should be gone. Error string also leaks the PIC oracle message onto a supporter field.
- **Evidence:**
  - `assertUsers` empty → 400 — `src/modules/asset-hub-catalog/asset-hub-item-meta.service.ts:91-95`
  - Create/bump already call `assertUsers` for PIC inside the same tx — `src/modules/prompt-library/prompt-library-upload.service.ts:81, 190, 314`
  - Plan Phase 2: "Create: default `[]` nếu omit. Bump: omit giữ; gửi `[]` xóa hết."
- **Suggested fix:** New `assertSupporterUsers`: allow `[]`; cap 20; dual-column live-user check; distinct error code. Never call `assertUsers` for supporters. Spec both `[]` create and `[]` bump-clear as first-class red tests, not "cap 20" only.

---

## Finding 4: Phase 2 ships a privilege cut on 3 live workspaces before any SO exists — pending and visibility lock up

- **Severity:** High
- **Location:** Phase 2, sections "Architecture", "Success Criteria", "Risk Assessment"; plan.md "TDD mỗi phase... Phase 2 tạm 403 mọi pending-edit"
- **Flaw:** Today an approver (and super_admin via guard bypass) can (1) patch any pending version and (2) hide/show any package with no service-level identity check. Phase 2 deletes the `approverPending` branch (403 everyone) and changes toggle to `creator ∨ supporter` only. Phase 3 SO is a later deploy. Risk text only admits "không ai sửa pending" and hand-waves "ship phase 3 cùng release nếu có thể" — not a gate. Toggle lockout is not even listed as a risk.
- **Failure scenario:**
  1. **Pending freeze:** Entry `PUT /v1/prompt/versions/:vid` → `PermissionGuard` (`prompt_upload` OR `prompt_approve`) → service `approverPending` (`prompt-library-upload.service.ts:237-238`). After Phase 2 this becomes 403 for every role. Typo in a live pending skill/prompt/api-catalog cannot be fixed. Queue stuck until Phase 3 lands **and** an SO is assigned.
  2. **Visibility freeze:** Entry `PATCH /v1/prompt/items/:id/status` → guard `prompt_approve` only (`prompt-library.controller.ts:233-239`) → `toggleStatus(id, dto)` with **no userId** (`prompt-library-upload.service.ts:414-421`). After Phase 2, approver-only still passes the guard (they hold `*_approve`) then 403 in service. Super-admin bypasses `PermissionGuard` (`permission.guard.ts:26-30`) and then 403s in the new service check. Leaked/wrong package stays public. Creator left the company → no one remaining can hide it until Phase 3 SO.
- **Evidence:**
  - Guard createVersion = upload only — `src/modules/prompt-library/prompt-library.controller.ts:176-186`
  - Guard editVersion = upload OR approve — `src/modules/prompt-library/prompt-library.controller.ts:194-204`
  - Guard toggle = approve only, no userId forwarded — `src/modules/prompt-library/prompt-library.controller.ts:233-239`
  - Super-admin bypasses verb gate — `src/common/authorization/guards/permission.guard.ts:26-30`
  - Service bump: approver may bump any package — `src/modules/prompt-library/prompt-library-upload.service.ts:133-138` (same in `skill-package-upload.service.ts:148-152`)
  - Service edit: `approverPending` skips newest-rejected — `src/modules/prompt-library/prompt-library-upload.service.ts:237-263`
  - Service toggle: no actor check — `src/modules/prompt-library/prompt-library-upload.service.ts:413-421`
  - Same toggle shape on skill — `src/modules/skill-package/skill-package.controller.ts:279-281`
- **Suggested fix:** Do not deploy Phase 2 without Phase 3 **and** a seeded per-WS SO role. Or keep a break-glass: `super_admin` OR existing `*_approve` may toggle and edit pending until `isAiHubWorkspaceSO` is live. Make "same release + SO row exists" a hard acceptance gate, not a footnote.

---

## Finding 5: "Clone prompt pending unique index" copies a predicate that TypeORM soft-delete does not satisfy — package cannot bump again

- **Severity:** High
- **Location:** Phase 4, section "Architecture" / "Risk Assessment"; Phase 5 "1 pending"
- **Flaw:** Prompt/skill/api-catalog pending uniqueness is `WHERE state='pending' AND is_deleted=false`. The migration comment claims this "ensures a soft-deleted pending row does not freeze the slot." That is false under TypeORM: `softDelete` sets `deleted_at`, leaves `is_deleted` false/null. The row **stays in the unique index**. Phase 4 says clone that index. Phase 4 `code` unique is specified only as "partial live" with the same soft-delete confusion.
- **Failure scenario:** Any path that `softDelete`s a pending coworker (failed cleanup, cook following Phase 1 TypeORM habit, a later admin tool) leaves `state='pending' AND is_deleted=false`. Next `createVersion` preflight may miss it if it filters `deleted_at IS NULL`, then INSERT hits 23505 → mapped to 409 "pending already exists". Approve/reject of the ghost row is 404 (`findOne({ is_deleted: false })` still finds it; if they filter `deleted_at` it 404s). Package is permanently un-bumpable. Same bug on `code`: TypeORM-soft-deleted package still occupies unique `is_deleted=false` → recreate same code 409 forever, contradicting "409 nếu trùng package chưa xóa mềm".
- **Evidence:**
  - Prompt index — `src/migration/2608121000-create-prompt-library-tables.ts:70-76`
  - Skill index, same predicate + same lying comment — `src/migration/2608110900-create-skill-package-tables.ts:86-92`
  - 23505 → 409 — `src/modules/prompt-library/prompt-library-upload.service.ts:217-223`
  - TypeORM only stamps `deleted_at` — `src/configuration/base-entity/base-soft-delete.entity.ts:5-8`
  - Two-path warning — `src/common/authorization/services/owner-scope-resolver.service.ts:14-18`
- **Suggested fix:** Do **not** clone the predicate. Use `WHERE state='pending' AND deleted_at IS NULL AND is_deleted IS NOT TRUE`. Same dual-column predicate on `coworker_packages.code`. Add a migration spec that TypeORM-softDelete + re-insert pending / reuse code succeeds. Preflight finders must use the same predicate as the index.

---

## Finding 6: Phase 3 wires SO on write services only — query/detail still use explicit `getUserPermissions`, so SO hides a package and 404s themselves

- **Severity:** High
- **Location:** Phase 3, section "Architecture" / "Hook"; Phase 2 `isUpdate` / inactive list; brainstorm "Inactive list: approver ∨ SO ∨ creator ∨ supporter" and detail flags
- **Flaw:** `PermissionGuard` folds implied verbs. `PermissionQueryService.getUserPermissions` does **not**. Every AI Hub query flag (`canApprove`, `canUpload`, inactive 404, `isUpdate`) reads only explicit role grants. Phase 3 hooks `createNew` / `createVersion` / `editVersion` / `toggle` / `approve` / optional `getMyPermissions.isWorkspaceSO`. It never rewrites `detail` / `list` inactive gates or adds `canEditPending`. Brainstorm flags (`canEditPending`, `canToggleStatus`) are not in any phase's implementation steps.
- **Failure scenario:** SO (sentinel, no `*_approve` row) passes `PermissionGuard` on `PATCH status` via implied approve (`permission.guard.ts:46-57`, `getUserImpliedVerbs` `owner-scope-resolver.service.ts:85-116`). Service toggle succeeds (Phase 3 helper). Next `GET` detail: `codes.includes('prompt_approve')` is false, `created_by` is not SO → `NotFoundException` for INACTIVE (`prompt-library-query.service.ts:234-242`). SO cannot unhide what they just hid. `isUpdate` stays `canApprove || (canUpload && isOwner)` until Phase 2 drops approver — still no SO bit — FE never shows pending-edit. Implied-upload SO fails `canBump.hasUpload` if cook sources `hasUpload` from `getUserPermissions` (correct for bump) but the same function is reused for toggle/inactive (incorrect).
- **Evidence:**
  - Explicit-only codes — `src/common/authorization/services/permission-query.service.ts:20-60`
  - Guard implied fold — `src/common/authorization/guards/permission.guard.ts:36-57`
  - Implied SQL is module-path, not `getUserPermissions` — `src/common/authorization/services/owner-scope-resolver.service.ts:99-116`
  - Detail inactive + `isUpdate` — `src/modules/prompt-library/prompt-library-query.service.ts:234-253`
  - AI Hub controllers have **no** `OwnerScopeGuard` — `src/modules/prompt-library/prompt-library.controller.ts:39`
  - Phase 3 Hook list omits query services
- **Suggested fix:** One helper used by **upload and query**: `{ hasUpload, hasApprove, isCreator, isSupporter, isWsSO }`. Inactive visible iff creator ∨ supporter ∨ explicit approve ∨ SO. Detail flags: `isUpdate=canBump`, `canEditPending=isWsSO && hasPending`, `canToggleStatus=creator∨supporter∨SO`. Add query specs in Phase 3, not "optional getMyPermissions".

---

## Finding 7: Owner-assignment save is a full replace — assigning per-WS SO can wipe bicc/workspace SO for the role

- **Severity:** High
- **Location:** Phase 3, section "Success Criteria" ("Owner-assignments UI nhận 4 resource_type sentinel"); brainstorm "Gán SO: role resource_owners sentinel"
- **Flaw:** `saveOwnerAssignments` is full-replace: `undefined` no-op, `[]` clears all, otherwise `UPDATE resource_owners SET deleted_at=NOW()` for the **entire role** then insert only the payload. It does not set `is_deleted`. Plan treats UI OWNER_ALL as a checkbox add. It never says the payload must echo every existing `resource_type`.
- **Failure scenario:** Admin adds `ai_hub_skill` sentinel `0` for a role that already owns bicc departments / ma_tool workspaces. FE (or a cook script) PUTs only the new type. All other `resource_owners` for that role get `deleted_at`. Implied verbs for bi-hub/ma-tool disappear after cache invalidate (`role.service.ts:165-167`). Cascading: those SOs lose report/program access in production while AI Hub SO is being set up. No plan rollback for `resource_owners`.
- **Evidence:**
  - Full-replace + `[]` clears all — `src/modules/role/role.service.ts:119-148`
  - Soft-delete assignments sets **only** `deleted_at` — `src/modules/role/role.service.ts:144-147`
  - Reads require `deleted_at IS NULL AND is_deleted IS NOT TRUE` — `src/common/authorization/services/owner-scope-resolver.service.ts:59-64`
- **Suggested fix:** Phase 3 must document merge semantics: read-modify-write of the full assignment list, or add a patch API. Seed/SO runbook: dump `resource_owners` before write; abort if payload types ⊂ existing types. Add a spec that saving `ai_hub_skill` does not delete `bicc_department` rows.

---

## Finding 8: `UPDATE permission.module_id` has no rollback remap — revert Phase 3 orphans 108/109/114/115/117/118 and 403s three live workspaces

- **Severity:** High
- **Location:** Phase 3, sections "Requirements", "Green" step 1, "Risk Assessment" (mpath only; no down())
- **Flaw:** Plan keeps permission ids and `UPDATE permission SET module_id=... WHERE code IN (...)`. Child module ids are `MAX(id)+1` at cook time. No `down()`: remap back to module 104, no Redis implied-verb bust, no "fail migration if UPDATE count ≠ 6". Existing skill/prompt/api permission `down()` deletes `WHERE id IN (...) AND module_id = 104` — after the move those deletes no-op; a botched rollback that DROPs child modules leaves rows pointing at missing `module_id`. `getUserPermissions` inner-joins `permission` via `role_permissions`; broken module_id / inactive module → empty codes → every AI Hub write 403.
- **Failure scenario:** Phase 3 migrate succeeds; implied-verb SQL starts resolving from child `table_name`. Deploy of app config fails or is rolled back independently. Or ops rolls back the migration by dropping child modules. Live `skill_upload` / `prompt_upload` / `api_upload` no longer sit on module 104 (`src/migration/2608111000-add-skill-package-permissions.ts:59-91`). Upload/approve on three production workspaces 403 until a manual SQL remap. Permission cache/implied-verb Redis still serves pre-move sets until TTL.
- **Evidence:**
  - Live perms live on module 104, `table_name=NULL` — `src/migration/2608111000-add-skill-package-permissions.ts:59-91`
  - Prompt 114/115 same module — `src/migration/2608121100-add-prompt-library-permissions.ts` (header + insert)
  - API 117/118 same module — `src/migration/1784990001000-add-api-catalog-permissions.ts:11-14`
  - Implied verbs key off `root_mod.table_name` — `src/common/authorization/services/owner-scope-resolver.service.ts:103-116`
  - Explicit codes from role→permission join only — `src/common/authorization/services/permission-query.service.ts:20-34`
  - Phase 3 Green: `UPDATE permission SET module_id=... WHERE code IN (...)` with no down() / count assert
- **Suggested fix:** Write `down()` first: `UPDATE permission SET module_id=104 WHERE code IN (skill_upload, skill_approve, prompt_upload, prompt_approve, api_upload, api_approve)`. `up()` must assert rowcount=6 or abort. After migrate, call `invalidateOwnerScopeAll`. Treat Phase 3 as expand-contract: ship child modules + dual-home (perms still on 104) until implied-verb tests pass, then move ids.

---

## Finding 9: Adding 4 package tables to `HIERARCHY_MAP` silently opens the records browser onto AI Hub catalog data

- **Severity:** Medium
- **Location:** Phase 3, section "Architecture" (`HIERARCHY_MAP`: 4 keys `null`; **Không** `RULE_TARGET_TABLES`)
- **Flaw:** Skipping `RULE_TARGET_TABLES` blocks **rule creation**, not browsing. `getRecords` is gated by `ALLOWED_TABLES` (= `HIERARCHY_MAP` keys). Own-all SO (or super_admin) gets every package `code` via `getUnscopedRecords`. That is a new data surface on live `skill_packages` / `prompt_packages` / `api_catalog_packages` the moment Phase 3 config ships — unrelated to coworker.
- **Failure scenario:** After Phase 3, any user who can open `/data-access` records and is SO or super_admin pages the full skill/prompt/api-catalog code list. Plan out-of-scope says "Data-access rule trên package AI Hub" but does not say "records browser". `buildAccessibleCTE` only iterates `RULE_TARGET_TABLES` (`owner-scope-helpers.ts:94-114`) so grouped CTE is safe; the **direct** `getRecords(tableName)` path is not.
- **Evidence:**
  - Browser allows any `ALLOWED_TABLES` member; rules are the subset — `src/modules/data-access/data-access.service.ts:1223-1227`
  - `ALLOWED_TABLES` = `HIERARCHY_MAP` keys — `src/modules/data-access/constants/hierarchy-config.ts:47`
  - Own-all comment: members browse every row — `src/modules/data-access/constants/hierarchy-config.ts:78-86`
  - Super-admin unscoped — `src/modules/data-access/data-access.service.ts:1237-1240`
- **Suggested fix:** If SO only needs implied verbs, do **not** add package tables to `HIERARCHY_MAP`. Implied verbs already key off `modules.table_name` + `resource_owners.resource_type`. Keep `RESOURCE_TYPE_TO_ROOT_TABLE` / `ROOT_OWNER_CONFIG` for sentinel validation without making tables browsable. If browse is required, add an explicit product decision and authz test.

---

## Scout / flow-trace notes (not extra findings)

- `OwnerScopeGuard` is a no-op on AI Hub (`prompt-library.controller.ts:39`). Plan's "SO implied upload qua PermissionGuard đã đủ" is true for **create**. It is **false** as a substitute for service checks on bump (`createVersion` must keep 403). If cook forgets the service 403, PermissionGuard + implied upload lets SO bump every package (brainstorm Risks already names this; Phase 3 restates it — still the single most likely cook miss).
- `replaceResponsibles` hard-deletes inside `FOR UPDATE` (`prompt-library-upload.service.ts:167, 194`). `replaceSupporters` without that lock + two concurrent SO `editVersion` is a lost-update (last insert wins or 23505). Phase 1 helper has no lock.
- Seeder still lists `id: 108` as `perm_history_view` (`src/seeders/permission.seeder.ts:252`) while migrations use 108=`skill_upload`. Phase 3 "giữ id 108/109/..." is migration-true and seeder-false. `UPDATE ... WHERE code IN` is the only safe key; do not UPDATE by id.

## Recommended rewrite order

1. Merge Phase 3 coworker DDL with config (Finding 1) or delay coworker module to Phase 4.
2. Specify supporter persist/read predicates + do not reuse `assertUsers` (Findings 2–3).
3. Gate Phase 2 behind Phase 3 + seeded SO, or keep approver/super_admin break-glass (Finding 4).
4. Dual-column unique indexes (Finding 5).
5. Query-layer SO flags in Phase 3 (Finding 6).
6. Owner-assignment merge + permission `down()` (Findings 7–8).

## Unresolved questions

- Will Phase 2 and Phase 3 ever ship as separate production deploys? Plan allows it; that is the lockout.
- Is records-browser visibility of `*_packages` an accepted product outcome? Not written down.
- Who is break-glass toggle if creator is gone and SO is not yet assigned?
