# Plan Red Team — Assumption Destroyer / Scope Auditor

- Plan: `plans/261009-1424-ai-hub-coworker`
- Reviewer: code-reviewer (hostile, plan-only)
- Date: 2026-10-09
- Verdict: **DO NOT COOK as written.** 2 Critical, 5 High, 2 Medium. Wrong SO diagnosis, dead empty-supporter path, ALLOWED_TABLES leak, explicit-vs-implied verb split, phase 3 toggle rollback.

Scope audited: module 104 lifetime, permission ids 108/109/114/115/116/117/118, `getUserImpliedVerbs` / `isInOwnedScope` / `OWNER_ALL`, `toggleStatus` call sites, `AssetHubItemMetaFieldsDto` / `assertUsers`, supporter vs PIC duplicate state, HIERARCHY_MAP → ALLOWED_TABLES instantiation.

---

## Finding 1: Module 104 NULL does not "ôm 4 WS" — implied verbs never match NULL; setting table_name on 104 would ôm every co-located perm

- **Severity:** Critical
- **Location:** Phase 3, section "Architecture"; brainstorm "SO wiring"; plan.md Key decisions
- **Flaw:** Claim "Asset Hub 104 `table_name=NULL` không dùng được — 1 SO sẽ ôm 4 WS" inverts the actual query. `getUserImpliedVerbs` binds `root_mod.table_name = ANY($1)`. SQL `NULL = ANY(...)` is never true, so module 104 as-is grants **zero** implied verbs. The real bomb is co-location: skill/prompt/api upload+approve **and** `asset_category_manage` all live on module 104 (`path=/asset-hub`). If cook "fixes" NULL by writing any package `table_name` onto 104, `sub.path LIKE '/asset-hub%'` returns every permission on that module. Child split is required because **perms share module_id=104**, not because NULL ôm 4 WS. Plan never mentions seeder dual-universe: `module.seeder` id 104 is `/permission/history`, not Asset Hub — `parentId=104` without `name='Asset Hub'` guard nests children under History.
- **Failure scenario:** Engineer sets `table_name='skill_packages'` on 104 to "make SO work". Skill SO implied set becomes `skill_upload`, `skill_approve`, `prompt_upload`, `prompt_approve`, `api_upload`, `api_approve`, `asset_category_manage`. One sentinel owns all three live workspaces + category CRUD. On seeder-first DBs, child INSERT `parentId=104` hangs off Lịch sử thay đổi.
- **Evidence:**
  - `src/common/authorization/services/owner-scope-resolver.service.ts:113` (`WHERE root_mod.table_name = ANY($1)`)
  - `src/common/authorization/services/owner-scope-resolver.service.ts:107` (`sub.path LIKE root_mod.path || '%'`)
  - `src/migration/2608111000-add-skill-package-permissions.ts:61-91` (104 NULL + skill_upload/approve)
  - `src/migration/2608121100-add-prompt-library-permissions.ts:11-90` (114/115 → module 104)
  - `src/migration/1784990001000-add-api-catalog-permissions.ts:11-90` (117/118 → module 104)
  - `src/migration/2608181220-add-asset-category-permission.ts:5-29` (116 `asset_category_manage` → module 104)
  - `src/seeders/module.seeder.ts:102-107` (id 104 = `/permission/history`)
- **Suggested fix:** Rewrite the diagnosis: keep 104 `table_name` NULL forever; never put package tables on 104. Child modules exist so `table_name` lookup hits a node whose `path` is **not** `/asset-hub`. Migration must `SELECT id FROM modules WHERE name='Asset Hub' AND path='/asset-hub'` — do not hardcode parent 104. Guard refuse if that row is History. Move 116 with 104 or document it stays on parent and is **not** implied to WS SOs.

---

## Finding 2: `replaceSupporters` → `assertUsers` 400s empty list — create default `[]` and bump `[]` clear cannot ship

- **Severity:** Critical
- **Location:** Phase 1, section "Green" step 3; Phase 2, section "Related Code Files" / "Omit vs required"
- **Flaw:** Phase 1: "`replaceSupporters` — assert users qua `assertUsers` sẵn có". `assertUsers` throws if `ids.length === 0`: `INVALID_RESPONSIBLE_USERS: at least one person in charge is required`. Phase 2: create omit → default `[]`; bump send `[]` → xóa hết. Those payloads hit `assertUsers([])` and 400 before persist. PIC and supporters share `MAX_RESPONSIBLE_USERS=20` but **not** min-1. Plan also aliases `MAX_SUPPORTERS = MAX_RESPONSIBLE_USERS` so a later PIC cap change silently moves supporter cap.
- **Failure scenario:** POST create with no `supporter_ids` (planned default `[]`) → 400. PUT bump with `"supporter_ids": []` to clear → 400. Spec "cap 20 + replace" green; empty-clear never written; production cannot have zero supporters.
- **Evidence:**
  - Phase 1 line 48 (`assertUsers` reuse)
  - Phase 2 lines 43-47 (create default `[]`; bump `[]` clear)
  - `src/modules/asset-hub-catalog/asset-hub-item-meta.service.ts:91-95` (empty → 400)
  - `src/modules/asset-hub-catalog/asset-hub-item-meta.service.ts:14` (`MAX_RESPONSIBLE_USERS = 20`)
  - `src/modules/asset-hub-catalog/dto/asset-hub-item-meta-fields.dto.ts:35-42` (`responsible_user_ids` `@ArrayMinSize(1)`)
- **Suggested fix:** New `assertSupporterUsers`: min 0, max 20, unknown ids 400, **do not** call `assertUsers`. DTO `supporter_ids` optional; omit ≠ `[]`. Tests: create omit → no rows; bump `[]` → all soft-deleted; bump omit → unchanged.

---

## Finding 3: `HIERARCHY_MAP` keys **are** `ALLOWED_TABLES` — skipping `RULE_TARGET_TABLES` does not keep packages off the records browser; phase 3 SO-wires `coworker_packages` before the table exists

- **Severity:** High
- **Location:** Phase 3, section "Architecture" (`HIERARCHY_MAP` / `OWNER_ALL_TABLES` / "Không RULE_TARGET_TABLES"); Phase 3 coworker module insert
- **Flaw:** `ALLOWED_TABLES = new Set(Object.keys(HIERARCHY_MAP))`. Adding `skill_packages` | `prompt_packages` | `api_catalog_packages` | `coworker_packages` as roots auto-allows `GET records?table=skill_packages`. For `OWNER_ALL_TABLES`, `getScopedRecords` uses `getUnscopedRecords` — SO sees **every** row. Plan treats "no RULE_TARGET" as "no data_access". False: rule **create** is RULE_TARGET; **browser** is ALLOWED_TABLES. Phase 3 inserts module `table_name='coworker_packages'` and adds that key to `OWNER_ALL_TABLES` **before** phase 4 CREATE TABLE. Any records-browser / own-all list in that window is `SELECT FROM coworker_packages` → relation does not exist → 500. `ma-tool-report-config.spec.ts` even asserts OWNER_ALL tables **must** be in ALLOWED_TABLES — cook will "fix" the spec by keeping them browsable.
- **Failure scenario:** After phase 3 migrate, admin opens owner_assignments / records browser for `/asset-hub/coworker` → PG 42P01. After phase 4, skill SO dumps all `skill_packages` (pending content metadata) through data-access API the AI Hub list never exposes. Out-of-scope "no data_access rule" does not cover this.
- **Evidence:**
  - `src/modules/data-access/constants/hierarchy-config.ts:47` (`ALLOWED_TABLES = Object.keys(HIERARCHY_MAP)`)
  - `src/modules/data-access/constants/hierarchy-config.ts:64-75` (`RULE_TARGET_TABLES` — currently no AI Hub tables)
  - `src/modules/data-access/constants/hierarchy-config.ts:88` (`OWNER_ALL_TABLES` = only `ma_tool_cstb_rpt_properties`)
  - `src/modules/data-access/data-access.service.ts:1223-1227` (browser = ALLOWED_TABLES)
  - `src/modules/data-access/data-access.service.ts:1436-1441` (OWNER_ALL → unscoped all rows)
  - `src/modules/data-access/__tests__/ma-tool-report-config.spec.ts:46-48` (OWNER_ALL must be browsable)
  - Phase 3 lines 32, 34 (`coworker_packages` module before table)
- **Suggested fix:** Do **not** put package tables in `HIERARCHY_MAP`. Implied verbs only need `modules.table_name` + `ROOT_OWNER_CONFIG` / `RESOURCE_TYPE_TO_ROOT_TABLE`. If OWNER_ALL UI requires a hierarchy key, gate `getRecords` to reject those four names (or delay coworker OWNER_ALL until phase 4 CREATE). Add a spec: `ALLOWED_TABLES.has('skill_packages') === false`.

---

## Finding 4: Implied verbs exist only in `PermissionGuard` — every service flag still uses `getUserPermissions` (explicit). SO APIs "work", FE flags and query gates lie

- **Severity:** High
- **Location:** Phase 3, section "Hook" / "getMyPermissions: thêm isWorkspaceSO optional"; Phase 2 `isUpdate` query
- **Flaw:** Claim "PermissionGuard đã fold implied verbs. POST OK cho SO" is true **only** at the guard. `getUserPermissions` is role_permissions ∪ data_access_users — **no** owner_verbs. Call sites that decide product behavior:
  - `getMyPermissions` → `canUpload` / `canApprove` explicit-only
  - `detail` `isUpdate` / inactive 404 `canApprove`
  - `list` inactive filter `canApprove`
  - `versionDetail` `can_review`
  - `createVersion` historically `codes.includes('*_approve')` (replaced by canBump, still needs an explicit `hasUpload` source)
  Phase 3 "optional isWorkspaceSO" does not fold SO into `canUpload`/`canApprove`. FE that trusts `GET my-permissions` hides Create / Review / Toggle for a user who can already POST via implied verbs. Reviews list: guard implied `*_approve` lets SO in; `can_review` on version detail stays false.
- **Failure scenario:** Role has sentinel `resource_id=0` for `ai_hub_prompt`, no `prompt_upload` row. POST `/v1/prompt/items` 201. GET `/v1/prompt/my-permissions` `{canUpload:false,canApprove:false}`. GET inactive list empty. GET version `can_review:false`. SO cannot operate from the UI the plan says they own. Cache: implied verbs Redis TTL 120s (`OWNER_SCOPE_CACHE_TTL`) — after module_id move, stale empty set until TTL even if flags were fixed.
- **Evidence:**
  - `src/common/authorization/guards/permission.guard.ts:51-55` (implied only here)
  - `src/common/authorization/services/permission-query.service.ts:20-52` (explicit only)
  - `src/modules/prompt-library/prompt-library-upload.service.ts:425-429` (`getMyPermissions`)
  - `src/modules/prompt-library/prompt-library-query.service.ts:144-149` (list inactive = `prompt_approve`)
  - `src/modules/prompt-library/prompt-library-query.service.ts:234-253` (detail inactive + `isUpdate`)
  - `src/modules/prompt-library/prompt-library-query.service.ts:546` (`can_review` = `canApprove`)
  - `src/common/authorization/constants/authorization.constant.ts:14`
- **Suggested fix:** Single helper `getAiHubVerbs(userId, ws)` = explicit ∪ implied (or `isAiHubWorkspaceSO` ORed into `canUpload`/`canApprove` for that ws only). Wire `getMyPermissions`, list/detail inactive, `can_review`, `isUpdate`. Tests: SO with **no** role_permissions row still `canUpload=true` on that ws only (skill SO `canUpload` false on prompt).

---

## Finding 5: Phase 3 toggle line re-opens stranger approver — contradicts phase 2, brainstorm, and global acceptance

- **Severity:** High
- **Location:** Phase 3, section "Hook" (`toggleStatus / approve: creator/supporter/SO hoặc approve code`); Phase 2 Architecture
- **Flaw:** Phase 2: `toggleStatus = creator ∨ supporter`; success "approver lạ 403". Brainstorm table: `creator ∨ supporter ∨ SO`. Global acceptance 4 names SO toggle, not approver. Phase 3 hook: "`toggleStatus / approve: creator/supporter/SO **hoặc approve code** (approve đã implied)`". If cook copies that sentence, `*_approve` (explicit **or** implied) toggles any package again — the entire phase 2 tightening of PATCH status is reverted. Approvers already pass today's guard (`@RequirePermission('prompt_approve')` only) and today's service has **no** identity check.
- **Failure scenario:** Phase 2 ships stranger-approver 403. Phase 3 "wire SO" adds `|| codes.includes('prompt_approve')`. Approver who is not creator/supporter/SO PATCHes status 200. Acceptance 4 / phase 2 checkbox still "green" in the doc, behavior is pre-plan.
- **Evidence:**
  - Phase 2 lines 31, 74 (`creator ∨ supporter`; approver lạ 403)
  - Phase 3 line 45 (`hoặc approve code`)
  - brainstorm-summary.md lines 24, 88
  - `src/modules/prompt-library/prompt-library-upload.service.ts:413-421` (toggle, no userId)
  - `src/modules/prompt-library/prompt-library.controller.ts:237-239` (`prompt_approve` only, no userId)
  - `src/modules/skill-package/skill-package-upload.service.ts:458` (same shape)
  - `src/modules/api-catalog/api-catalog.controller.ts:215-216` (same shape)
- **Suggested fix:** One predicate for PATCH status across phase 2+3: `(creator ∨ supporter ∨ isWsSO) ∧ guard(upload∨approve)`. Approver-not-owner-not-supporter-not-SO → 403. Do not share the approve-endpoint predicate with toggle. Delete "hoặc approve code" from phase 3.

---

## Finding 6: Plan patches list `isUpdate` only — supporter still 404s inactive detail; version/diff/my-versions ignore supporter rows

- **Severity:** High
- **Location:** Phase 2, section "Architecture" / "Green" step 5 (`isUpdate` + inactive list); brainstorm "Inactive list"
- **Flaw:** Scope auditor: supporter state lives in `ai_hub_supporters`; read path hydrates PIC from `*_package_responsibles` only. Access checks that still exist after phase 2 as written:
  - `detail`: inactive → 404 unless `isOwner || canApprove` (no supporter)
  - `list`: status gate is **global** `canApprove ? INACTIVE : ACTIVE` — not "OR my packages". Plan says "creator/supporter thấy inactive" without SQL. Naive `canApprove || isOwner` on the whole list wrongly shows **all** inactive to a creator, or still hides them if status omitted (current default ACTIVE-only).
  - `listVersions` WHERE `submitted_by = $user OR created_by = $user` — supporter unseen
  - `getDiff` / `versionDetail` `canAccess` = submitter ∨ creator ∨ approver — supporter 403
  Supporter+upload can `createVersion` (if canBump wired) then cannot GET the inactive package they must toggle, cannot open version detail, cannot diff.
- **Failure scenario:** Package inactive. User is supporter with `prompt_upload`, not creator. PATCH status: maybe 200 after phase 2. GET `/items/:id` → 404 `'Prompt package not found or inactive'`. FE never shows the row. GET `/versions/:vid` 403. Acceptance "supporter+upload bump OK" passes; toggle/view does not.
- **Evidence:**
  - `src/modules/prompt-library/prompt-library-query.service.ts:239-242` (inactive detail 404)
  - `src/modules/prompt-library/prompt-library-query.service.ts:146-149` (list: approver-only inactive)
  - `src/modules/prompt-library/prompt-library-query.service.ts:304` (`submitted_by OR created_by`)
  - `src/modules/prompt-library/prompt-library-query.service.ts:565-567` (diff access)
  - `src/modules/asset-hub-catalog/asset-hub-item-meta-read.service.ts:33-37` (PIC tables only; no supporters)
  - `src/modules/asset-hub-catalog/asset-hub-item-meta.service.ts:20-24` (`AssetHubWorkspace` no coworker; PIC map only)
- **Suggested fix:** One `canSeeInactive(pkg, user)` = creator ∨ supporter ∨ approver ∨ SO. Apply to **list OR-clause**, detail, export. Add supporter to versionDetail/diff/listVersions or document them as creator-only. Batch-load supporters in `AssetHubItemMetaReadService` (same 1-query-per-page as PIC) — do not N+1 `ai_hub_supporters` per row.

---

## Finding 7: `toggleStatus` has no `userId` (plan is right) but guard is approve-only — supporter identity never reaches the service unless they already hold a verb

- **Severity:** High
- **Location:** Phase 2, section "Architecture" (`toggleStatus` controller phải truyền `userId`); brainstorm PATCH status
- **Flaw:** All three controllers: `toggleStatus(id, dto)` — service cannot know creator/supporter/SO. Plan adds `userId` + upload OR on guard. Brainstorm still says toggle = creator ∨ supporter ∨ SO. Supporter is a **row in `ai_hub_supporters`**, not a permission code. After OR-guard, a supporter with **neither** `*_upload` nor `*_approve` is 403 at `PermissionGuard` before service. Phase 6 seed is `coworker_uploader` / `coworker_approver` only — no supporter-without-verb fixture. Unstated dep: "every supporter is also granted upload". Contradicts acceptance 2 ("supporter không upload → 403 dù được gắn") which is bump-only but will be copy-pasted onto toggle.
- **Failure scenario:** Product attaches user B as supporter, B has no AI Hub codes. B should hide/show per brainstorm. PATCH `/items/:id/status` → `Missing required permission: one of [prompt_upload, prompt_approve]`. Service unit test with mocked userId never runs for this user.
- **Evidence:**
  - `src/modules/prompt-library/prompt-library.controller.ts:237-239`
  - `src/modules/skill-package/skill-package.controller.ts:277-281`
  - `src/modules/api-catalog/api-catalog.controller.ts:212-216`
  - `src/modules/prompt-library/prompt-library-upload.service.ts:413-414` (`toggleStatus(packageId, dto)` — no user)
  - `src/modules/skill-package/__tests__/skill-package-perm.spec.ts:31-32` (toggle = `skill_approve` only)
  - `src/modules/prompt-library/__tests__/prompt-library-perm.spec.ts:31-32`
  - `src/common/authorization/guards/permission.guard.ts:59-60`
- **Suggested fix:** Decide in the plan, not at cook: (A) toggle requires upload∨approve **and** (creator∨supporter∨SO) — document supporter-without-verb cannot toggle; or (B) Bearer-only + service identity check. Update perm specs + seed. Thread `userId` on all 3 WS + coworker. Do not leave phase 2 tests calling `toggleStatus(id, dto)` two-arg.

---

## Finding 8: Duplicate identity — DTO "Tác giả" is `responsible_user_ids` / PIC tables; `canBump` uses `created_by` + new `ai_hub_supporters`. PIC never authorizes. Soft-delete supporters vs hard-delete PIC.

- **Severity:** Medium
- **Location:** Phase 1 entity `ai_hub_supporters`; Phase 2 DTO; brainstorm "Tác giả vs supporter"; plan.md "JSON PIC hiện vẫn `responsible_user_ids`"
- **Flaw:** Three package-level identities: `created_by`, PIC (`*_package_responsibles`), supporters (`ai_hub_supporters`). Write DTO labels `responsible_user_ids` as "Tác giả". Bump/edit today: `created_by` (or approver), **not** PIC membership. Plan adds supporters to canBump, still ignores PIC. Users in the Tác giả picker cannot bump unless they are also `created_by` or copied into `supporter_ids`. Lifetime: PIC `replaceResponsibles` **hard-deletes**; supporters planned **soft-delete** + unique `(type,data_id,user_id) WHERE deleted_at IS NULL`. Dual-column delete (`is_deleted` vs `deleted_at`) documented on owner-scope as a leak class — unique partial on `deleted_at` only blocks re-insert after `is_deleted=true` leftover. `type` varchar includes `api-catalog` while PIC uses workspace union `'api-catalog'` — OK — but `AssetHubWorkspace` has no `'coworker'` until phase 5; phase 1 "extend union only" without `RESPONSIBLE_ENTITY.coworker` makes `replaceResponsibles('coworker')` undefined if someone shares the map.
- **Failure scenario:** FE fills Tác giả, leaves supporters empty. Creator leaves company; PIC cannot bump; only a supporter row would help and nobody set it. replaceSupporters sets `is_deleted` without `deleted_at`; next replace same user_id → unique violation 500, not 200. Cook extends `AssetHubWorkspace` in phase 1, PIC switch missing coworker, create coworker in phase 5 throws.
- **Evidence:**
  - `src/modules/asset-hub-catalog/dto/asset-hub-item-meta-fields.dto.ts:29-42` (Tác giả = `responsible_user_ids`)
  - `src/modules/prompt-library/prompt-library-upload.service.ts:135-138` (bump = `created_by` / approve, not PIC)
  - `src/modules/skill-package/skill-package-upload.service.ts:148-151`
  - `src/modules/api-catalog/api-catalog-upload.service.ts:137-140`
  - `src/modules/asset-hub-catalog/asset-hub-item-meta.service.ts:137-149` (PIC hard `manager.delete`)
  - `src/common/authorization/services/owner-scope-resolver.service.ts:14-18` (must filter **both** delete columns)
  - `src/modules/asset-hub-catalog/asset-hub-item-meta.service.ts:18` (`AssetHubWorkspace` = skill|prompt|api-catalog)
- **Suggested fix:** Plan one sentence: PIC is display-only; bump identity = `created_by` ∨ supporters. Unique partial `WHERE deleted_at IS NULL AND COALESCE(is_deleted,false) = false`. Mirror PIC hard-delete **or** dual-column soft-delete — pick one. Do not add `'coworker'` to `AssetHubWorkspace` until `RESPONSIBLE_ENTITY` + read tables exist (phase 4/5). Supporters stay generic SQL keyed by `type` string in phase 1.

---

## Finding 9: `isInOwnedScope` + sentinel 0 is correctly "won't match" — but phase 3 still puts package tables in `HIERARCHY_MAP`, which **activates** a walk that compares real ids to 0

- **Severity:** Medium
- **Location:** Phase 3 `isAiHubWorkspaceSO`; brainstorm "`isInOwnedScope` với id=0 không match"
- **Flaw:** Today `isInOwnedScope(user, 'skill_packages', pkgId)` returns false at the unknown-table gate (`HIERARCHY_MAP` has no skill_packages). After phase 3 adds `skill_packages: null`, the function **runs** the root SQL: `FROM skill_packages t0 WHERE t0.id = $pkg AND t0.id = ANY($ownedRootIds)` with `$ownedRootIds=[0]`. Serial ids start at 1; always false. Helper `rootTable=tableName && rootId===0` is the only correct SO probe. Plan says `OwnerScopeResolver không đổi trừ helper SO` then also says `isInOwnedScope` không dùng được — cook may "reuse isInOwnedScope" once the table is in HIERARCHY_MAP because that is how diagnostic/ma-tool SO works. Prompt/skill controllers have **no** OwnerScopeGuard today; PermissionGuard still sets `verbFromExplicit=false` for implied SO. Cloning a diagnostic-style guard onto coworker (phase 5 "copy prompt" is safe; a "proper SO" refactor is not) would deny every real package id.
- **Failure scenario:** Phase 3 helper implemented as `return this.ownerScope.isInOwnedScope(userId, 'skill_packages', 0)` or `isInOwnedScope(..., pkg.id)` after HIERARCHY_MAP add. First form: `t0.id=0` matches no row. Second: `pkg.id=ANY([0])` false. SO pending-edit always 403. Specs mock `isAiHubWorkspaceSO` true and never hit the resolver.
- **Evidence:**
  - `src/common/authorization/services/owner-scope-resolver.service.ts:194-195` (unknown table → false)
  - `src/common/authorization/services/owner-scope-resolver.service.ts:231-243` (`t0.id = ANY($2)` owned roots)
  - `src/modules/data-access/constants/hierarchy-config.ts:111-116` (`OWNER_ALL_RESOURCE_ID = 0`; comment: sentinel never equals a real row)
  - `src/modules/data-access/helpers/owner-scope-helpers.ts:103-108` (sentinel ≠ `ro.resource_id = t0.id`)
  - `src/modules/prompt-library/prompt-library.controller.ts:39-40` (no OwnerScopeGuard)
  - `src/common/authorization/guards/permission.guard.ts:63-67` (`verbFromExplicit=false` on implied)
- **Suggested fix:** Freeze in phase 3: `isAiHubWorkspaceSO` reads `getUserOwnerScope()` only (`rootId===0 && rootTable===table`). Ban `isInOwnedScope` on AI Hub tables in a unit test. Do not add package tables to `HIERARCHY_MAP` (see Finding 3). Do not put OwnerScopeGuard on coworker/prompt/skill/api-catalog.

---

## Claim checklist (challenged)

| Claim | Result |
|---|---|
| Asset Hub 104 `table_name` NULL | **True as migrated** (`2608111000:69`). **False that NULL ôm 4 WS** — NULL never matches implied-verb SQL. Perms 108/109/114/115/116/117/118 all `module_id=104`. Seeder 104 is History. |
| Implied verbs skip `action=create` | **True** (`owner-scope-resolver.service.ts:115`). `skill_upload` action=`upload` **would** be implied once a module `table_name` matches. |
| `isInOwnedScope` vs OWNER_ALL sentinel 0 | **True, will not match real package ids** (`:243` + `OWNER_ALL_RESOURCE_ID=0`). Helper required. Do not enable via HIERARCHY_MAP. |
| `AssetHubItemMetaFieldsDto` still `responsible_user_ids` | **True** (`asset-hub-item-meta-fields.dto.ts:42`). Not renamed. Adding `supporter_ids` here hits create+bump+edit on 3 WS. |
| `toggleStatus` no `userId` | **True** on all 3 controllers + services. Guard approve-only. |
| `getUserImpliedVerbs` uses `modules.table_name` | **True** (`:113`). |

---

## Plan tasks — completeness vs codebase

- Phase 1 helper-without-SO: OK if `assertUsers` not reused (Finding 2).
- Phase 2 3-WS wire: incomplete without detail/diff/versions/toggle identity (Findings 5–7).
- Phase 3 SO: blocked on Findings 1, 3, 4, 9. Do not INSERT coworker OWNER_ALL before table.
- Phase 4–5 clone prompt: unstated trap `code = prompt_${id}` at `prompt-library-upload.service.ts:99` vs user-provided unique — phase 5 risk section covers usage_guide not code autogen. Add a red spec: create does **not** write `coworker_${id}`.
- Phase 6 stats: `ArtifactType` currently `'skill'\|'prompt'\|'api-catalog'` (`latest-artifacts.service.ts:9`); listLatest keys `apiCatalogs` not `api-catalogs`. Plan key `coworkers` must extend the union or tsc fails — out of this review's lint ban, still a cook landmine.

## Recommended next steps (planner)

1. Rewrite SO wiring around co-located module_id=104 + `table_name = ANY`, not "NULL ôm 4 WS".
2. Split `assertSupporterUsers` from PIC `assertUsers`.
3. Keep package tables **out** of `HIERARCHY_MAP` / `ALLOWED_TABLES`.
4. Fold implied verbs (or `isWsSO`) into every query/flag path, not optional `isWorkspaceSO`.
5. One toggle predicate; delete phase 3 "hoặc approve code".
6. Supporter visibility on detail/list/diff/versions, not just `isUpdate`.

## Unresolved questions

- Is supporter-without-upload allowed to toggle, or is that bump-only?
- PIC: display-only forever, or later added to canBump? Plan silent.
- Ship phases 3+4 in one migrate so `coworker_packages` module cannot 500 the records browser?
- Production modules.id 104: Asset Hub (migration) or History (seeder)? Plan assumes the former with no probe.
