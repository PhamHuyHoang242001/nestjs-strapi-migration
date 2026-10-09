# Plan red-team review — Security Adversary / Fact Checker

**Plan:** `plans/261009-1424-ai-hub-coworker`  
**Perspective:** attacker (auth bypass, injection, data exposure, privilege escalation)  
**Role:** Fact Checker — claims grepped against the live codebase  
**Date:** 2026-10-09  
**Verdict:** Plan is not production-safe as written. Implied-verb SO + service-layer explicit-only authz + immediate `supporter_ids` grant is a privilege-escalation machine. Do not cook until the findings below are closed in the plan.

---

## Finding 1: Child-module path clone of `/asset-hub` detonates cross-WS implied verbs

- **Severity:** Critical
- **Location:** Phase 3, section "Architecture" / "Green" / "Risk Assessment"
- **Flaw:** `getUserImpliedVerbs` grants **every** permission whose module `path LIKE root_mod.path || '%'`. Isolation between skill/prompt/api-catalog/coworker is entirely a string-prefix property of `modules.path`. Existing Asset Hub migrations all upsert path `/asset-hub` on module 104. Phase 3 Green is one line — "Migration modules + UPDATE permission SET module_id" — with **no** INSERT SQL for `path` / `"parentId"` / `mpath`. `modules.path` is **not unique**. If cook clones `2608111000` (the obvious template), every child gets path `/asset-hub`, skill SO matches `/asset-hub%`, and implied set swallows `prompt_*`, `api_*`, and `asset_category_manage`. AI Hub controllers have **no** `DataAccessInterceptor` / `OwnerScopeGuard` to contain the blast — PermissionGuard implied match **is** the HTTP authz.
- **Failure scenario:** Admin assigns sentinel SO for `ai_hub_skill` only. Attacker (skill SO, zero prompt/api grants) `POST /v1/prompt/items`, `POST /v1/prompt/versions/:vid/approve`, `PATCH` any prompt status, and `GET /v1/prompt/reviews` (full pending bodies). Same for api-catalog. Category CRUD if `asset_category_manage` stays on 104 and 104's path is a prefix of the child's path — or if the child path **is** `/asset-hub`.
- **Evidence:**
  - `src/common/authorization/services/owner-scope-resolver.service.ts:107` — `sub.path LIKE root_mod.path || '%'`
  - `src/common/authorization/services/owner-scope-resolver.service.ts:99-116` — only excludes `p.action = 'create'` at the **root_mod** row; `upload`/`approve`/`manage` all implied
  - `src/common/authorization/guards/permission.guard.ts:46-67` — implied code is enough to pass; `verbFromExplicit` is a downstream signal AI Hub never reads
  - `src/modules/prompt-library/prompt-library.controller.ts:39-47` — comment: no DataAccessInterceptor, no OwnerScopeGuard; only BearerGuard at class level
  - `src/migration/2608111000-add-skill-package-permissions.ts:61-67` — path `/asset-hub`, table_name NULL
  - `src/migration/2608121100-add-prompt-library-permissions.ts:63-71` — same path upsert
  - `src/migration/1784990001000-add-api-catalog-permissions.ts:63-71` — same
  - `src/migration/2608181220-add-asset-category-permission.ts:5-8` — `asset_category_manage` (id 116) remains on module 104
  - `src/modules/databases/module.entity.ts:9-10` — `path` nullable, **no unique**
  - Phase 3 Green step 1 (phase-03 line 67) vs architecture table (phase-03 lines 27-30)
- **Suggested fix:** Pin exact INSERT: unique paths `/asset-hub/skill|prompt|api-catalog|coworker`, `parentId=104`, distinct mpath, CHECK `path` unique among live rows. Spec: skill SO implied set **equals** `{skill_upload, skill_approve}` — assert `not.toContain('prompt_upload'|'api_approve'|'asset_category_manage')`. Add a migration-SQL spec that the INSERT string is not `/asset-hub` for children. Do **not** clone 2608111000's path.

---

## Finding 2: SO pending-edit `supporter_ids` bypasses "SO cannot bump others"

- **Severity:** Critical
- **Location:** Phase 3, section "Hook" (`editVersion` pending); Phase 5, section "Architecture" (`replaceSupporters` immediate); brainstorm "Set supporter"
- **Flaw:** Pending edit is **SO-only**. `supporter_ids` full-replace is **package-level, effective immediately, does not wait for approve**. `canBump = hasUpload ∧ (creator ∨ supporter)`. Org-wide `*_upload` is a shared role (seed `skill_uploader`), not per-package. SO cannot bump directly (service 403) but can PUT pending with `supporter_ids: [<any uploader id>]`, then that uploader bumps. Plan never forbids SO writing `supporter_ids`, never requires owner consent, never delays supporter grants until approve.
- **Failure scenario:** Package P owned by victim, pending version in flight. Skill SO (implied upload+approve, not creator) `PUT /v1/skill/versions/:pendingVid` with `supporter_ids: [colludingUploader]`. `replaceSupporters` commits in the same tx. Colluder (holds `skill_upload`, not owner) waits for reject **or** — if SO also rejects then colluder `PUT .../versions` — `canBump` true. Colluder submits a malicious zip. SO approves. Owner never opted in. Global acceptance #4 ("403 bump package người khác") is theater.
- **Evidence:**
  - brainstorm-summary.md:75 — "hiệu lực ngay — không chờ approve, giống PIC"
  - brainstorm-summary.md:84 — `PUT versions/:vid pending` **chỉ SO**
  - brainstorm-summary.md:79 — `canBump` = upload ∧ (created_by ∨ supporter); **không SO**
  - `src/modules/prompt-library/prompt-library-upload.service.ts:230-318` — `editVersion` already `replaceResponsibles` on pending approver path; plan adds `replaceSupporters` the same way
  - `src/modules/skill-package/skill-package-upload.service.ts:144-151` — bump authz is service-layer after PermissionGuard already guaranteed `skill_upload`
  - `src/scripts/seed-skill-test-users.ts:27` — `skill_uploader` role is global `skill_upload`, not bound to a package
  - plan.md:55 — `supporter_ids` on create/bump/editVersion replace immediately
- **Suggested fix:** Pending SO edit **must not** accept `supporter_ids` (strip/forbid). Or supporter grants require creator confirmation / wait for approve. Or `canBump` ignores supporters added during an in-flight pending by a non-creator. Add a red spec: SO pending PUT `supporter_ids=[uploader]` then that uploader `createVersion` → **403**.

---

## Finding 3: Authz split-brain — implied verbs on write, explicit-only on read

- **Severity:** High
- **Location:** Phase 3, section "Hook" ("PermissionGuard đã fold implied verbs"); Phase 2/5 query `isUpdate` / inactive / reviews
- **Flaw:** PermissionGuard ORs `permissionCache.hasPermission` (explicit `getUserPermissions`) with `getUserImpliedVerbs`. Every upload/query service re-checks `permissionQuery.getUserPermissions` **only** — implied SO is invisible. Phase 3 wires `isAiHubWorkspaceSO` into **upload** create/pending/toggle/approve. Phase 3 **Related Code Files** does not list the 3 query services. Result: SO passes `POST approve/reject` and `GET /reviews` (guard-only) but `versionDetail` / `getDiff` / inactive `detail`/`list` treat SO as a stranger (403/404). `can_review` stays false. Plan's "SO duyệt được" is write-only. Attacker SO rubber-stamps skill zips / coworker Teams links without `GET .../diff`. Review queue still dumps version rows (`getMany` + `stripGuide` keeps `prompt_content` / coworker `link`).
- **Failure scenario:** Skill SO opens review UI → `GET /v1/skill/reviews` 200 (implied `skill_approve`). `GET /v1/skill/versions/:vid` 403 (`canApprove` false). `GET .../diff` 403. `POST .../approve` 200. Malicious pending zip goes live. Inactive: SO `PATCH status=inactive` (phase 3 toggle ∨ SO) then `GET items/:id` 404 — cannot confirm what they hid; any logged-in user also cannot, but the SO cannot either.
- **Evidence:**
  - `src/common/authorization/guards/permission.guard.ts:46-57` — explicit OR implied
  - `src/common/authorization/services/permission-query.service.ts:20-60` — role_permissions ∪ data_access_users **only**; no owner_scope
  - `src/modules/prompt-library/prompt-library-query.service.ts:485-488` — `canAccess` = submitter ∨ creator ∨ `codes.includes('prompt_approve')`
  - `src/modules/prompt-library/prompt-library-query.service.ts:560-567` — same for `getDiff`
  - `src/modules/prompt-library/prompt-library-query.service.ts:144-149` — inactive list gate = explicit `prompt_approve` only
  - `src/modules/prompt-library/prompt-library-query.service.ts:241` — inactive detail 404 unless owner or explicit approve
  - `src/modules/prompt-library/prompt-library-query.service.ts:410-451` — `listReviews` no userId; full version rows after `stripGuide` (usage_guide/zip_tree only)
  - `src/modules/prompt-library/prompt-library.controller.ts:109-116` — reviews = PermissionGuard `prompt_approve` only
  - `src/modules/prompt-library/prompt-library-upload.service.ts:425-430` — `getMyPermissions` explicit codes only
  - phase-03.md:47-54 — related files omit `*-query.service.ts`
- **Suggested fix:** Single helper `hasApprovePower(userId)` = explicit approve ∨ `isAiHubWorkspaceSO`. Use it in list/detail/inactive/versionDetail/getDiff/`can_review`/getMyPermissions. Red specs: SO-only user (empty `getUserPermissions`, mocked SO true) → reviews 200, versionDetail 200, diff 200, inactive list 200, approve 200.

---

## Finding 4: Toggle guard widening turns today's IDOR into org-wide hide/DoS

- **Severity:** High
- **Location:** Phase 2, section "Architecture" / "TDD red" item 4
- **Flaw:** `toggleStatus` today: `@RequirePermission('*_approve')` **and** service sets `pkg.status = dto.status` with **zero** caller identity. Phase 2 changes the guard to `upload OR approve` so any of hundreds of uploaders can **hit** the method, then promises a new service check `creator ∨ supporter`. Tests specified: "owner upload → 200; **stranger approve-only** → 403". The common attacker is **stranger with upload** (the seed role). That case is not in the red list. If cook flips the decorator before the service check — or implements `canApprove || creator || supporter` leftover from bump — every uploader hides any package. Separately, the intended end state **strips approvers of unhide**: a rogue creator `PATCH inactive` and only they (or a later SO) can restore. Approvers can still **list** inactive (explicit approve) but cannot PATCH. Phase 2 can ship without phase 3 SO.
- **Failure scenario:** (A) Ordering bug: uploader U, not owner, `PATCH /v1/prompt/items/42/status {status:inactive}` → 200; catalog entry vanishes. (B) Intended policy: owner hides a production skill; every `skill_approver` gets 403 on toggle; no SO assigned yet (phase 2-only deploy) → permanent hide until owner or a later SO.
- **Evidence:**
  - `src/modules/prompt-library/prompt-library.controller.ts:233-239` — `RequirePermission('prompt_approve')`; **no** `userId` passed
  - `src/modules/prompt-library/prompt-library-upload.service.ts:413-421` — load package, assign status, save; no user check
  - `src/modules/skill-package/skill-package.controller.ts:275-281` — same
  - `src/modules/skill-package/skill-package-upload.service.ts:457-465` — same
  - `src/modules/api-catalog/api-catalog.controller.ts:215-216` — same
  - `src/modules/prompt-library/__tests__/prompt-library-perm.spec.ts:31-32` — toggle is approve-only today
  - phase-02.md:34 — "toggleStatus controller phải truyền userId (hiện prompt không truyền)"
  - phase-02.md:56 — tests omit stranger-upload
  - phase-02.md:79 — accepts phase 2→3 gap for pending; silent on toggle availability
- **Suggested fix:** Keep approve-only guard until service check is in the same commit. Red spec: `skill_upload` only, not creator/supporter → 403. Red spec: explicit approver, not creator/supporter/SO → 403 **and** document who can unhide (must include SO **in phase 2** or forbid shipping phase 2 alone). Never OR-in upload on the decorator without the service identity check already green.

---

## Finding 5: Plan drops the "ownership before zip I/O" invariant — local-file read for any uploader

- **Severity:** High
- **Location:** Phase 2, section "Green" step 1 (`createVersion: if !canBump → 403`)
- **Flaw:** Skill `createVersion` **intentionally** runs the owner check **before** `downloadZip` so a non-owner who holds `skill_upload` cannot force the server to read attacker-chosen paths under `public/`. Phase 2 replaces the check with `canBump` (extra `ai_hub_supporters` query) and never says the check stays first. Approver-bump is removed, so the new unauthorized caller is exactly "has `skill_upload`, not creator/supporter" — they still pass PermissionGuard. If canBump lands after `downloadZip`, every uploader reads any zip in `public/uploads` (shared Strapi volume) as a 403 prelude.
- **Failure scenario:** Uploader U crafts `PUT /v1/skill/items/<not-theirs>/versions` with `file.fileUrl=/uploads/<victim-or-internal>.zip`. Guard passes (`skill_upload`). Service downloads/parses zip, then 403s. Attacker times process or uses error differences (422 zip vs 403) as an oracle; worst case path-normalization bugs in `resolveLocalPath` get exercised by unauthorized callers.
- **Evidence:**
  - `src/modules/skill-package/skill-package-upload.service.ts:144-171` — comment "Ownership guard FIRST — before any disk I/O"; then `downloadZip`
  - `src/modules/skill-package/skill-file-fetch.util.ts:6-10` — filesystem read of shared `public/uploads`, not HTTP
  - `src/modules/skill-package/skill-file-fetch.util.ts:34-48` — path traversal guard exists; still a privileged read
  - `src/modules/skill-package/skill-package.controller.ts:218-219` — `RequirePermission('skill_upload')` only
  - phase-02.md:28 — `createVersion: if !canBump → 403` with no ordering constraint
  - phase-02.md:60-64 — Green order: load supporters, gỡ approverPending, thread userId… no "before downloadZip"
- **Suggested fix:** Write in phase 2: `canBump` (and pending preflight) **before** `downloadZip` / `extractSkillZip` / avatar assert. Red spec: non-owner uploader → 403 **and** `downloadZip` not called (already the pattern in spirit of lines 144-147).

---

## Finding 6: "Không RULE_TARGET_TABLES" does not keep data-access off AI Hub packages

- **Severity:** High
- **Location:** Phase 3, section "Architecture" (`HIERARCHY_MAP` + `OWNER_ALL_TABLES` + **Không** `RULE_TARGET_TABLES`); brainstorm "SO wiring"
- **Flaw:** Plan treats skipping `RULE_TARGET_TABLES` as "không data_access rule trên package AI Hub". Records browser allowlist is `ALLOWED_TABLES = Object.keys(HIERARCHY_MAP)`, **not** `RULE_TARGET_TABLES`. Adding 4 package tables to `HIERARCHY_MAP` (required for `isInOwnedScope`/`findRootTable`) automatically exposes `GET /v1/report-access/records/skill_packages` (etc.). For `OWNER_ALL_TABLES`, SO sees **every** live row (no `status` filter) via `getUnscopedRecords`. Independently, `ROOT_OWNER_CONFIG` makes `GET /v1/role/owner-resources/:tableName` interpolate `FROM "skill_packages"` and return **id + code** of all non-deleted packages — including inactive — to any `perm_role_create|update` caller. Role admins are not skill approvers. `listOwnerResources` does not special-case OWNER_ALL to skip listing real rows (it still SELECTs the table even though assignments must be sentinel 0).
- **Failure scenario:** Role admin (no AI Hub grants) `GET /v1/role/owner-resources/skill_packages` → harvests every skill `code` (hidden tools included). Data-access admin + skill SO `GET /v1/report-access/records/skill_packages` → same, plus `created_at`. Phase 3 inserts `coworker_packages` into `HIERARCHY_MAP` **before** phase 4 creates the table → `FROM "coworker_packages"` 500, or worse a cook stub table. Plan's success criterion "`RULE_TARGET_TABLES` không chứa 4 package tables" can all be green while this leak ships.
- **Evidence:**
  - `src/modules/data-access/constants/hierarchy-config.ts:47` — `ALLOWED_TABLES = new Set(Object.keys(HIERARCHY_MAP))`
  - `src/modules/data-access/data-access.service.ts:1223-1227` — getRecords gated by **ALLOWED_TABLES**, comment: rule creation only uses RULE_TARGET_TABLES
  - `src/modules/data-access/data-access.service.ts:1436-1441` — OWNER_ALL → all rows or empty
  - `src/modules/data-access/data-access.service.ts:1356-1394` — unscoped SELECT `id, nameCol, created_at`; no status filter
  - `src/modules/data-access/report-access-records.controller.ts:21-29` — `GET records/:tableName` + `perm_data_access_create`
  - `src/modules/role/role.service.ts:81-105` — `FROM "${tableName}"` if key in `ROOT_OWNER_CONFIG`; keyword ILIKE on `code` once NAME_COLUMN_MAP is set
  - `src/modules/role/role.controller.ts:137-146` — owner-resources, `perm_role_create|update`
  - `src/modules/role/role.service.ts:135-138` — OWNER_ALL assignments must be sentinel 0; **list** API still dumps real rows
  - phase-03.md:34 — HIERARCHY_MAP 4 keys null + OWNER_ALL + ROOT_OWNER_CONFIG; not RULE_TARGET
  - phase-03.md:32 — coworker module row before table exists
- **Suggested fix:** Do **not** put AI Hub package tables in `HIERARCHY_MAP` unless records-browser/owner-resources are explicitly desired. `isAiHubWorkspaceSO` only needs `getUserOwnerScope` + `RESOURCE_TYPE_TO_ROOT_TABLE` — not a hierarchy walk. If they must register ROOT_OWNER_CONFIG for the owner-assignment UI, special-case OWNER_ALL in `listOwnerResources` to return `[{id:0, display_name:'ALL'}]` and **never** SELECT the package table. Add red spec: `ALLOWED_TABLES.has('skill_packages') === false` **or** getRecords/owner-resources return sentinel-only.

---

## Finding 7: `action='upload'` is a deliberate bypass of the SO "no sibling-root create" invariant

- **Severity:** High
- **Location:** Phase 3, section "Architecture" ("Implied verbs: action='upload'|'approve' không bị exclude create"); brainstorm "SO"
- **Flaw:** `getUserImpliedVerbs` exists to **stop** an owner of a root from creating sibling roots: `NOT (sub.id = root_mod.id AND p.action = 'create')`. Child module **is** the root (`HIERARCHY_MAP[skill_packages]=null`). `skill_upload` sits on that root with `action='upload'`, so the exclusion never fires. PermissionGuard then treats implied `skill_upload` as `POST /items`. Plan celebrates this. There is no allowlist of codes — **any** future permission on `/asset-hub/skill` (`delete`, `manage`, a mistaken leftover) auto-grants to every skill SO. Combined with Finding 1 (path prefix) and Finding 3 (no query-layer SO), the implied-verb engine was not designed for "workspace admin of a catalog of sibling packages".
- **Failure scenario:** Cook later adds `skill_delete` (`action=delete`) on the skill child module for a trash endpoint. Every skill SO immediately passes PermissionGuard on delete without a plan change. Or: `asset_category_manage` is moved onto a child whose path prefixes siblings (Finding 1) → SO manages categories globally.
- **Evidence:**
  - `src/common/authorization/services/owner-scope-resolver.service.ts:99-116` — documented "owning a root record does not imply permission to create sibling roots"; SQL excludes only `action='create'`
  - `src/common/authorization/__tests__/owner-scope-resolver.service.spec.ts:164-179` — pins that invariant
  - `src/migration/2608111000-add-skill-package-permissions.ts:90-91` — `skill_upload` action=`upload`, `skill_approve` action=`approve`
  - `src/modules/prompt-library/prompt-library.controller.ts:161-169` — `POST items` = `RequirePermission('prompt_upload')` only; `createNew` does **not** re-check codes (`prompt-library-upload.service.ts:67`)
  - `src/modules/prompt-library/prompt-library-upload.service.ts:65-66` — self-approve allowed by design
  - phase-03.md:36-42 — explicit "không bị exclude create → SO có upload+approve"; POST OK for SO via guard
- **Suggested fix:** Do not overload implied verbs for catalog SO. Options: (a) explicit role_permissions on the SO role for `*_upload`/`*_approve` (no implied); (b) extend implied-verb SQL with an allowlist table of codes; (c) keep implied approve only, require explicit upload for create. If implied stays, add a load-time assert: permissions on OWNER_ALL AI Hub modules may only have `action IN ('upload','approve')`. Spec the allowlist in phase 3, not a comment.

---

## Finding 8: Immediate `supporter_ids` is an unauthenticated-to-the-target privilege grant; `assertUsers` is the wrong primitive

- **Severity:** High
- **Location:** Phase 1, section "Green" (`replaceSupporters` + `assertUsers`); Phase 2, DTO omit/keep/`[]` clear
- **Flaw:** `canBump` and `toggleStatus` treat supporter like co-owner. `*_upload` is org-wide. Any creator (or bump-capable supporter) can add **any live user id** as supporter and immediately confer bump+toggle on that package, no approval, no notification, no per-package upload. `assertUsers` **rejects empty arrays** (`at least one person in charge is required`) and is a PIC helper. Plan says reuse it for supporters **and** "bump: omit keep, `[]` clear". Those two sentences cannot both be implemented with the current function. If cook calls `assertUsers` as written, `[]` 400s and supporters cannot be cleared. If cook skips the min-1 check but keeps the existence query, `supporter_ids` becomes a **user-id oracle** (400 "do not exist" vs 200) — the PIC comment already admits this risk.
- **Failure scenario:** Stolen `skill_uploader` account creates a decoy package, sets `supporter_ids` to a privileged user who also holds upload (or to themselves via a second account). That account bumps/hides victim-adjacent packages they were added to. On clear: FE sends `[]` to drop a compromised supporter → 400 forever, compromised supporter retains bump forever.
- **Evidence:**
  - `src/modules/asset-hub-catalog/asset-hub-item-meta.service.ts:89-108` — `assertUsers`: min 1, max 20, 400 if any id missing; comment "must not become a membership oracle"
  - `src/modules/asset-hub-catalog/asset-hub-item-meta.service.ts:14` — `MAX_RESPONSIBLE_USERS = 20` (plan wants to alias for supporters)
  - phase-01.md:48-49 — `replaceSupporters` via `assertUsers`; `MAX_SUPPORTERS = 20` alias
  - phase-02.md:43-47 — create default `[]`; bump omit keep; `[]` clear
  - brainstorm-summary.md:88 — PATCH status = creator ∨ supporter ∨ SO
  - `src/modules/asset-hub-catalog/dto/asset-hub-item-meta-fields.dto.ts:35-37` — PIC `ArrayMinSize(1)` — supporters would need a different DTO if empty is legal
- **Suggested fix:** New `assertSupporterUsers` that allows empty, returns 400 **without** distinguishing missing vs unauthorized ids (same generic error, constant-time). Cap 20. Spec: `[]` clears; omit on bump does not call replace. Toggle/bump still require the supporter to hold `*_upload` **and** be in the table — document that org-wide upload + supporter = co-admin, or require a per-package capability instead of reusing the global verb.

---

## Fact-check: claims that survived grep

| Plan claim | Code | Result |
|---|---|---|
| Module 104 Asset Hub, `table_name` NULL | `2608111000-add-skill-package-permissions.ts:10,61-69` | True |
| Perm ids 108/109, 114/115, 117/118 | skill/prompt/api permission migrations | True |
| `OWNER_ALL_TABLES` only `ma_tool_cstb_rpt_properties` | `hierarchy-config.ts:88` | True today |
| `isInOwnedScope` id=0 cannot match real rows | `hierarchy-config.ts:111-114`; `isInOwnedScope` joins `t0.id` | True |
| `approverPending` exists on 3 upload services | prompt 238, skill 259, api 242 | True |
| Prompt toggle does not pass `userId` | `prompt-library.controller.ts:238-239` | True |
| `toggleStatus` service is approve-IDOR | `prompt-library-upload.service.ts:414-421` | True |
| Avatar `assertStrapiUrl` origin-only, no fetch | `prompt-avatar-url.util.ts:30-35` | True |
| Prompt route is **not** `/v1/ai-hub/prompt` | `@Controller('v1/prompt')` vs api-catalog `@Controller('v1/ai-hub/api-catalog')` | Plan coworker path matches **api-catalog**, not prompt — clone-prompt copy-paste will mount the wrong prefix if cook follows prompt.controller |
| PermissionGuard already folds implied verbs | `permission.guard.ts:51-56` | True — and that is the bug surface, not a free lunch |

---

## Recommended actions (priority)

1. Rewrite phase 3 module migration with locked path/parentId/mpath + negative implied-verb specs (Finding 1).  
2. Forbid `supporter_ids` on SO pending edit; add deputize-bump red spec (Finding 2).  
3. Fold SO into **query** authz, not just upload (Finding 3).  
4. Do not OR-in upload on toggle until service identity check is green; include stranger-upload 403 (Finding 4).  
5. Keep canBump before `downloadZip` (Finding 5).  
6. Drop AI Hub tables from `HIERARCHY_MAP` / records browser; sentinel-only owner-resources (Finding 6).  
7. Stop using `action='upload'` as a create-root loophole without an allowlist (Finding 7).  
8. Do not call `assertUsers` for supporters; specify empty/oracle behavior (Finding 8).

## Unresolved questions

- Is coworker mounted at `/v1/ai-hub/coworker` (api-catalog style) or `/v1/coworker` (prompt/skill style)? Plan and prompt clone disagree.
- Who is allowed to unhide after phase 2 if SO is not deployed?
- Are supporter grants supposed to be visible to the target user (notification), or is silent co-admin the product intent?
