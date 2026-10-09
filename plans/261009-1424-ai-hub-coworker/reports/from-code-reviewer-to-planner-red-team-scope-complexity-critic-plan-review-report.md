# Plan review: AI Hub coworker + supporters + per-WS SO

Perspective: Scope & Complexity Critic (YAGNI / over-engineering / missing MVP cuts)
Verification role: Contract Verifier
Mode: hostile. Plan document only — no lint/build/test. Claims grepped against codebase.

Plan: `plans/261009-1424-ai-hub-coworker/`
Repo: `base-be-ts-sql`

Verdict: **reject as written**. This is three products glued into one 4d plan: (1) new Coworker workspace, (2) live auth rewrite on skill/prompt/api-catalog, (3) hijack of data-access `OWNER_ALL` / `HIERARCHY_MAP` for SO. Brainstorm Approach C (coworker first) was the only MVP. This plan chose A and then added a phase-2→3 blackout on pending-edit for three live workspaces.

---

## Contract inventory (grep, not "update all callers")

### `toggleStatus` — signature today is `(packageId, dto)` with **no `userId`**; guard is `*_approve` only

| Site | Line |
|---|---|
| `src/modules/prompt-library/prompt-library.controller.ts` | 233–239 (`@RequirePermission('prompt_approve')`; `toggleStatus(id, dto)`) |
| `src/modules/skill-package/skill-package.controller.ts` | 275–281 (`skill_approve`; `toggleStatus(id, dto)`) |
| `src/modules/api-catalog/api-catalog.controller.ts` | 210–216 (`api_approve`; `toggleStatus(id, dto)`) |
| `src/modules/prompt-library/prompt-library-upload.service.ts` | 413–414 `async toggleStatus(packageId, dto)` — comment "Only approvers" |
| `src/modules/skill-package/skill-package-upload.service.ts` | 457–458 same |
| `src/modules/api-catalog/api-catalog-upload.service.ts` | 425 same |
| `src/modules/prompt-library/__tests__/prompt-library-perm.spec.ts` | 31–32 expect `['prompt_approve']` |
| `src/modules/skill-package/__tests__/skill-package-perm.spec.ts` | 31–32 expect `['skill_approve']` |
| `src/modules/api-catalog/__tests__/api-catalog-perm.spec.ts` | 31–32 expect `['api_approve']` |
| `src/modules/prompt-library/__tests__/prompt-library-upload.service.spec.ts` | 683, 695 (2-arg calls) |
| `src/modules/skill-package/__tests__/skill-package-upload.service.spec.ts` | 772, 784 |
| `src/modules/api-catalog/__tests__/api-catalog-upload.service.spec.ts` | 694, 706 |
| `src/modules/prompt-library/__tests__/prompt-library-upload-meta.spec.ts` | 230 `typeof proto.toggleStatus` |
| `src/modules/skill-package/__tests__/skill-package-upload-meta.spec.ts` | 327 |
| `src/modules/api-catalog/__tests__/api-catalog-upload-meta.spec.ts` | 236 |

Phase 2 Related Code Files lists "3 controllers `toggleStatus` + `userId`" and does **not** list the 3 `*-perm.spec.ts` files. Adding `userId` without flipping those three perm expects + six 2-arg spec calls is a broken contract, not a footnote.

### `createVersion` — service already takes `userId`; **approver-not-owner currently 200**

| Site | Line |
|---|---|
| Controllers | `prompt-library.controller.ts:179–186`, `skill-package.controller.ts:221–228`, `api-catalog.controller.ts:156–163` |
| Services | `prompt-library-upload.service.ts:129` + guard 135–138; `skill-package-upload.service.ts:140` + 146–151; `api-catalog-upload.service.ts:131` |
| Approver bump **allowed** specs (must flip to 403) | `prompt-library-upload.service.spec.ts:480`, `skill-package-upload.service.spec.ts:508`, `api-catalog-upload.service.spec.ts:482` |
| Perm (unchanged `*_upload`) | `prompt-library-perm.spec.ts:19–20`, `skill-package-perm.spec.ts:19–20`, `api-catalog-perm.spec.ts:19–20` |
| Meta specs also call it | `prompt-library-upload-meta.spec.ts:161,170,178`; `skill-package-upload-meta.spec.ts:204,213,221,229`; `api-catalog-upload-meta.spec.ts:167,176,184` |

### `editVersion` — approver-pending path is live, not a comment

| Site | Line |
|---|---|
| Controllers (OR upload\|approve) | `prompt-library.controller.ts:197–204`, `skill-package.controller.ts:239–246`, `api-catalog.controller.ts:174–181` |
| Services `approverPending` | `prompt-library-upload.service.ts:230,238–240`; `skill-package-upload.service.ts:251,259–261`; `api-catalog-upload.service.ts:232,242–244` |
| Approver-pending **200** specs (must become 403 in phase 2) | `prompt-library-upload.service.spec.ts:625`, `skill-package-upload.service.spec.ts:710`, `api-catalog-upload.service.spec.ts:628` |
| Perm | `prompt-library-perm.spec.ts:61–62`, `skill-package-perm.spec.ts:65–66`, `api-catalog-perm.spec.ts:65–66` |

### `AssetHubWorkspace` type — union `'skill' \| 'prompt' \| 'api-catalog'`

| Site | Line |
|---|---|
| Definition | `src/modules/asset-hub-catalog/asset-hub-item-meta.service.ts:18` |
| Exhaustive `Record<AssetHubWorkspace, …>` maps | same file `:20–24 RESPONSIBLE_ENTITY`, `:26–30 VERSION_TAG_ENTITY`, `:32–36 ARTIFACT_TYPE`, `:38–42 PACKAGE_OWNER`, `:44–48 VERSION_OWNER` |
| Read maps | `asset-hub-item-meta-read.service.ts:27–31 VERSION_TAG_TABLE`, `:33–37 RESPONSIBLE_TABLE`; used at `:52–60`, `:82–90` |
| List filters | `asset-hub-list-filters.ts:9–13 VERSION_TAG_TABLE`; applied at `:31–33` |
| Callers of `applyAssetHubCatalogFilters` | `prompt-library-query.service.ts:166,188`; `skill-package-query.service.ts:172,193`; `api-catalog-query.service.ts:176,201` |

Adding `'coworker'` to the union in phase 1 without filling every `Record<AssetHubWorkspace, …>` is a type error, not "chỉ type union".

### `listStats`

| Site | Line |
|---|---|
| Impl (hardcoded 3 workspaces) | `latest-artifacts.service.ts:169–181` |
| `ArtifactType` union (no coworker) | `latest-artifacts.service.ts:9` |
| Controller | `latest-artifacts.controller.ts:34–37` |
| Spec (3 aggregates, 3 query calls) | `latest-artifacts-stats.service.spec.ts:19,29–35,42–48,53–56,61,84–88` |

### `listUsers` `@RequirePermission`

| Site | Line |
|---|---|
| Decorator (6 codes, no coworker) | `asset-hub-catalog.controller.ts:48–56` |
| Spec exact array | `asset-hub-catalog-perm.spec.ts:12–21` |

Phase 5 (`phase-05` line 42) **and** phase 6 (`phase-06` lines 24, 35) both claim this change. Split ownership.

### `replaceResponsibles`

| Site | Line |
|---|---|
| Definition | `asset-hub-item-meta.service.ts:137–150` |
| `createNew` | `prompt-library-upload.service.ts:96`; `skill-package-upload.service.ts:103`; `api-catalog-upload.service.ts:98` |
| `createVersion` (bump) | prompt `:194`; skill `:211`; api `:196` |
| `editVersion` | prompt `:318`; skill `:349`; api `:329` |
| Meta specs | `prompt-library-upload-meta.spec.ts:45,120,172`; `skill-package-upload-meta.spec.ts:46,131,215`; `api-catalog-upload-meta.spec.ts:45,120,178` |
| Upload spec mocks | `prompt-library-upload.service.spec.ts:31`; `skill-package-upload.service.spec.ts:39`; `api-catalog-upload.service.spec.ts:38` |
| Unit spec | `asset-hub-item-meta.service.spec.ts:169,181` |

Phase 2 TDD step 5 says `replaceSupporters` on create/bump only. Global acceptance item 6 and brainstorm require `editVersion` too. Those three `:318/:349/:329` sites are missing from the phase 2 file list.

---

## Finding 1: Four SO child modules dump AI Hub into the data-access records browser — YAGNI bomb, ghost table in phase 3

- **Severity:** Critical
- **Location:** Phase 3, section "Architecture"; brainstorm "SO wiring"
- **Flaw:** Plan registers `skill_packages` / `prompt_packages` / `api_catalog_packages` / `coworker_packages` in `HIERARCHY_MAP` (null roots), `OWNER_ALL_TABLES`, `ROOT_OWNER_CONFIG`, `NAME_COLUMN_MAP`. `ALLOWED_TABLES = new Set(Object.keys(HIERARCHY_MAP))`, so those four tables become records-browser targets. Phase 3 still inserts the coworker **module** with `table_name='coworker_packages'` **before the table exists** (phase 4). Out of scope already says "Data-access rule trên package AI Hub" — then the plan wires the tables into the data-access hierarchy anyway. This is using MA Tool own-all as a permission hack for a product that has no records-browser requirement.
- **Failure scenario:** After phase 3 migrate, owner-assignments can assign `ai_hub_coworker` sentinel. Anyone hitting data-access `getRecords('coworker_packages')` runs `SELECT` against a table that does not exist → Postgres `42P01`. Same path for the three live package tables: SO of skill now browses **every** `skill_packages` row via `getScopedRecords` own-all branch (`OWNER_ALL_TABLES.has` → `getUnscopedRecords`). AI Hub packages leak into a UI they were never in. Implied-verb SQL `sub.path LIKE root_mod.path || '%'` now keys off child module `table_name`; one wrong `mpath` and skill SO inherits prompt verbs — the plan's own risk note, not a mitigate.
- **Evidence:**
  - Plan: `phase-03-so-child-modules-and-implied-verbs.md:23–34` (4 tables + coworker module before table); `:32` "vẫn insert module row `table_name='coworker_packages'`"
  - `src/modules/data-access/constants/hierarchy-config.ts:47` `ALLOWED_TABLES = new Set(Object.keys(HIERARCHY_MAP))`; `:60–61` every hierarchy table is browsable; `:88` `OWNER_ALL_TABLES` today is **only** `ma_tool_cstb_rpt_properties`
  - `src/modules/data-access/data-access.service.ts:1223–1227` `getRecords` allows any `ALLOWED_TABLES` member; `:1436–1441` own-all → unscoped SELECT of the table
  - `src/common/enums/data-access-table.enum.ts:2–25` — **no** AI Hub package tables; phase 3 Related Code Files never mention this enum (`phase-03:48–54`)
  - `src/modules/data-access/__tests__/ma-tool-report-config.spec.ts:46–51` existing OWNER_ALL table is required to be in `ALLOWED_TABLES` **and** `DATA_ACCESS_TABLE`
  - `src/common/authorization/services/owner-scope-resolver.service.ts:102–117` implied verbs join `modules.root_mod.table_name`
- **Suggested fix:** Cut the 4-module hierarchy work from this plan. Keep Asset Hub module 104 as-is. Implement `isAiHubWorkspaceSO` as a direct `resource_owners` lookup (resource_type per WS, `resource_id=0`) **without** `HIERARCHY_MAP` / `OWNER_ALL_TABLES` / `ALLOWED_TABLES`. If implied verbs are required, add 4 child modules with `table_name` still NULL or a dummy, and do **not** put package tables in the data-access whitelist. Do not insert `coworker_packages` as `table_name` until phase 4 creates the table. Better MVP: skip SO entirely until coworker ships.

## Finding 2: `toggleStatus` contract rewrite is underspecified and self-contradictory — owner-upload 200 cannot reach the service

- **Severity:** Critical
- **Location:** Phase 2, sections "Architecture", "Related Code Files", "TDD red" step 4, "Green" step 3
- **Flaw:** Phase 2 requires `toggleStatus(id, dto, userId)` and TDD "owner upload không approve → 200". Today the route is `@RequirePermission('*_approve')` only and the service is 2-arg with zero identity check. Related Code Files names 3 controllers, not the 3 perm specs that pin approve-only. Green text says "perm spec (guard **không** đổi trừ toggle thêm upload OR)" — a parenthetical, not a file list. Brainstorm wants "guard upload OR approve" **and** "Toggle owner/supporter OK; approver lạ 403". If the guard stays approve-only, the owner-upload case never enters the service. If the guard becomes OR, every uploader in the workspace hits the endpoint and the **service** must 403 strangers — which is a new identity check the 2-arg signature cannot do, and the three upload specs still call 2 args.
- **Failure scenario:** Cook adds `userId` to services, forgets perm specs → `prompt-library-perm.spec.ts:31` fails. Cook flips perm to OR, forgets service identity → any `prompt_upload` holder can hide any prompt (current service writes status with no user check). Cook ships phase 2 with approve-only guard → TDD step 4 "owner upload không approve → 200" is unreachable; success criterion "Toggle owner/supporter OK" is a lie for upload-only creators.
- **Evidence:**
  - Plan: `phase-02-tighten-3-ws-edit-approve-status.md:19,31–34,41,56,62–68,74`
  - Controllers + 2-arg services + perm expects: inventory above (`prompt-library.controller.ts:233–239`, `prompt-library-upload.service.ts:413–414`, `prompt-library-perm.spec.ts:31–32`, and skill/api twins)
  - Specs still 2-arg: `prompt-library-upload.service.spec.ts:683,695` (skill `:772,784`, api `:694,706`)
- **Suggested fix:** One phase, one contract table. Explicitly: change `@RequirePermission` on all 3 controllers to `*_upload, *_approve`; change 3 service signatures to `(packageId, dto, userId)`; change 3 perm specs to `toEqual(['prompt_upload','prompt_approve'])` (and skill/api); change 6 spec call sites to pass `USER_ID`; add stranger-approver 403 cases. Do not say "guard không đổi" in the same breath as "thêm upload OR".

## Finding 3: Phase 2 ships a pending-edit blackout on three live workspaces — fake phasing, not MVP

- **Severity:** Critical
- **Location:** Phase 2 "Architecture" / "Risk Assessment"; `plan.md` "TDD mỗi phase"; Global acceptance 3
- **Flaw:** Phase 2 sets `editVersion pending: 403 (mọi role)`. Phase 3 reopens it for SO only. Risk Assessment: "Khoảng phase 2→3: **không ai sửa pending**. Accept." That is not an acceptable cut. Approver-pending-edit is **production behavior** today (`approverPending` + specs that expect 200). Splitting "deny everyone" and "allow SO" across phases means any cook pause, any failed phase-3 migration, any prod deploy of phase 2 alone, breaks the only pending-edit path the three live WS have. Effort already claims 4d for the whole plan — there is no delivery reason to land a known 403 window.
- **Failure scenario:** Phase 2 merges. Approver opens PUT `/v1/prompt/versions/:vid` on pending (current happy path `prompt-library-upload.service.spec.ts:625`) → 403. FE "approver pending skip locked" (skill zip lock at `skill-package-upload.service.ts:286`) dies. Phase 3 blocked on hierarchy-config (Finding 1) → blackout lasts. Global acceptance "Approver không `PUT` pending" is the end state; the **interim** of "nobody can" is extra scope with user-visible breakage and zero product value.
- **Evidence:**
  - Plan: `phase-02-tighten-3-ws-edit-approve-status.md:30,54,71–79`; `plan.md:46`
  - Live path: `prompt-library-upload.service.ts:238–240`; skill `:259–261`; api `:242–244`
  - Live 200 tests: `prompt-library-upload.service.spec.ts:625`; `skill-package-upload.service.spec.ts:710`; `api-catalog-upload.service.spec.ts:628`
- **Suggested fix:** Merge phase 2+3 auth into one deployable slice, **or** leave approver-pending-edit in place until SO is actually wired. Do not land a "403 mọi role" commit on skill/prompt/api-catalog. Better MVP: do not touch the 3 live WS pending path in this plan at all — ship coworker with SO-only pending from day one.

## Finding 4: Plan is three features; 4d / 6 phases is not an MVP cut

- **Severity:** Critical
- **Location:** `plan.md` Overview + Phases; brainstorm Approaches A vs C
- **Flaw:** User-visible product is Coworker (clone prompt). Supporters + per-WS SO + tightening 3 live WS are cross-cutting rewrites of auth that coworker does not need to exist. Brainstorm Approach C "Coworker trước, SO/supporter sau" was rejected because "Quyền lệch giữa WS". That is a **consistency preference**, not a blocker. This plan then spends phase 1–3 entirely on the cross-cut before coworker write APIs exist (phase 5). Result: you cannot ship coworker without rewriting live `createVersion` / `editVersion` / `toggleStatus` / query `isUpdate` / inactive gates / hierarchy-config. Effort `4d` for: new table, 3-WS auth, 4 SO modules + permission `module_id` move, 6 coworker tables, full prompt clone, stats/latest/picker/seed/docs — fantasy. Clone of prompt **alone** is phase 5's `1.5d`.
- **Failure scenario:** Phase 1–3 slip (they will; Finding 1 is a data-access minefield). Coworker never ships. Three live workspaces already have half-applied canBump / 403-pending. Or cook "finishes" in 4d by cloning prompt mechanically (Finding 8) and skipping caller lists (Findings 2, 5, 6, 7).
- **Evidence:**
  - `plan.md:20–22,36–44,50–56` — coworker + supporters + SO + 3-WS tighten in one plan, effort 4d
  - `brainstorm-summary.md:37–42` Approach C discarded for "Quyền lệch", not for a hard dependency
  - `phase-05-coworker-apis-clone-prompt.md:10–14` coworker write APIs are phase 5, after the live-WS rewrite
  - Phase efforts: 4h + 1d + 1d + 4h + 1.5d + 3h ≈ 4d with **zero** slack for hierarchy/permission-id/migration risk the plan itself lists (`brainstorm-summary.md:126–129`)
- **Suggested fix:** Split. Plan A (this one, slim): coworker clone of prompt, existing bump=approver-or-owner rule, no supporters, no SO, no 3-WS tighten. Plan B later: supporters + canBump + SO. If product insists on same auth day one, still drop the 4-module `HIERARCHY_MAP` work (Finding 1) and merge 2+3 (Finding 3). Do not hold coworker hostage to Asset Hub module-tree surgery.

## Finding 5: Phase 1 `AssetHubWorkspace += 'coworker'` breaks exhaustive Records; coworker has no tags/category anyway

- **Severity:** High
- **Location:** Phase 1 "Related Code Files"; Phase 5 "Related Code Files" / Risk
- **Flaw:** Phase 1 tells cook to extend `AssetHubWorkspace` "chỉ type union nếu coworker entity chưa có". The type is the key of five exhaustive `Record<AssetHubWorkspace, …>` maps in the meta service, two in the read service, one in list-filters. TypeScript will demand a `'coworker'` entry for tag tables, PIC entities, artifact types, package-owner columns. Coworker **does not have** tags or category (`brainstorm-summary.md:29`; `phase-05:14`). Phase 5 later says modify `AssetHubWorkspace` + PIC map + "meta read filters" — duplicate, and still no instruction to **stop** using `applyAssetHubCatalogFilters` (which interpolates `*_version_tags` and `av.category_id`).
- **Failure scenario:** Phase 1 adds `'coworker'` to the union → compile error on `ARTIFACT_TYPE` / `VERSION_TAG_TABLE` / `RESPONSIBLE_ENTITY` / `PACKAGE_OWNER`. Cook stubs fake coworker tag/PIC tables that do not exist until phase 4. Phase 5 clones prompt query, calls `applyAssetHubCatalogFilters(qb, 'coworker', query)` → SQL against `coworker_version_tags` (never created; coworker has `coworker_version_channels`) and `av.category_id` (column does not exist on `coworker_versions` per `phase-04:27`). List/search 500s.
- **Evidence:**
  - Plan: `phase-01-supporters-table-and-canbump-helper.md:32`; `phase-05-coworker-apis-clone-prompt.md:41,69`; `phase-04-coworker-schema-and-lookup-get.md:27–28` (no category/tags)
  - Type + maps: `asset-hub-item-meta.service.ts:18,20–48`
  - Read: `asset-hub-item-meta-read.service.ts:27–37`
  - Filters with `category_id` + tag subquery: `asset-hub-list-filters.ts:9–13,31–54`
  - Callers of that helper: `prompt-library-query.service.ts:166,188`; `skill-package-query.service.ts:172,193`; `api-catalog-query.service.ts:176,201`
- **Suggested fix:** Do **not** add `'coworker'` to `AssetHubWorkspace` in phase 1. Keep supporters keyed by a separate string union. In phase 5, extend PIC/`RESPONSIBLE_ENTITY` only. Write a coworker list filter that searches name/description/code — do not call `applyAssetHubCatalogFilters`. Do not create fake tag maps for a workspace with no tags.

## Finding 6: `replaceSupporters` told to reuse `assertUsers` — empty `supporter_ids` is a 400; `editVersion` callers omitted

- **Severity:** High
- **Location:** Phase 1 Green step 3; Phase 2 DTO omit-keep + TDD step 5; `plan.md` acceptance 6
- **Flaw:** `assertUsers` **requires** ≥1 id (`INVALID_RESPONSIBLE_USERS: at least one person in charge is required`) and is covered by a spec that rejects `[]`. Supporters are optional, create default `[]`, bump `[]` means clear-all (`phase-02:43,47`). Aliasing `MAX_SUPPORTERS = MAX_RESPONSIBLE_USERS` does not change the empty-list throw. Separately, `replaceResponsibles` is invoked on **editVersion** in all 3 WS; phase 2 TDD only asserts create/bump. Acceptance 6 says create/bump/**editVersion**. Omit-keep on bump also needs a skip-if-`undefined` branch that PIC does **not** have (`responsible_user_ids` is required on the shared DTO).
- **Failure scenario:** Create with omitted `supporter_ids` → `assertUsers([])` → 400, so no package can be created without dummy supporters. Bump with `supporter_ids: []` to clear → 400, cannot remove supporters. Cook wires replace on create/bump only → `editVersion` (the only path to change supporters while pending, per `brainstorm-summary.md:127`) never writes `ai_hub_supporters`; SO pending-edit leaves stale supporter rows. Shared DTO `AssetHubItemMetaFieldsDto` (`phase-02:43`) has no omit-keep for arrays today — adding optional `supporter_ids` onto a DTO that skill/prompt/api **create and version both extend** means omit on create vs omit on bump need service-mode branching the plan never writes.
- **Evidence:**
  - Plan: `phase-01-supporters-table-and-canbump-helper.md:48–49`; `phase-02-tighten-3-ws-edit-approve-status.md:43–47,57`; `plan.md:55`; `brainstorm-summary.md:75,127`
  - `asset-hub-item-meta.service.ts:91–95` empty list throws; `:14` `MAX_RESPONSIBLE_USERS = 20`
  - `asset-hub-item-meta.service.spec.ts:83–88` `'rejects an empty list'`
  - `asset-hub-item-meta-fields.dto.ts:29–42` `responsible_user_ids` required min 1 — no omit-keep
  - `replaceResponsibles` on editVersion: `prompt-library-upload.service.ts:318`; `skill-package-upload.service.ts:349`; `api-catalog-upload.service.ts:329`
- **Suggested fix:** New `assertOptionalUsers` that allows `[]`, caps at 20, still 400 on unknown ids. `replaceSupporters(manager, type, dataId, userIds | undefined)` — `undefined` no-op, `[]` soft-delete all. Wire it next to every `replaceResponsibles` call including the three `editVersion` sites. Do not put `supporter_ids` on `AssetHubItemMetaFieldsDto` without a written create-vs-bump matrix; coworker already needs a slim DTO (`phase-05:69`).

## Finding 7: Read path / inactive / `isUpdate` — plan names "3 query services" and misses the actual gates

- **Severity:** High
- **Location:** Phase 2 "Architecture" `isUpdate` / inactive list; Phase 2 Related Code Files "item-meta-read hydrate"; brainstorm "Inactive list" / "Flag detail"
- **Flaw:** Hydrate is not a read-service-only change. `loadPackageMeta` in each query service is the fold site (`responsible_users` today). Inactive visibility is **list + detail + download/export**, not "inactive list". `isUpdate` is computed in detail, version, and review-row mapping — currently `canApprove || (canUpload && isOwner)`, which **is the flag FE uses to show Edit**. Tightening bump without flipping `isUpdate` leaves approvers seeing Edit then getting 403. Brainstorm wants `canEditPending` / `canToggleStatus` on detail; phase 2/3 never list those response fields or the `getMyPermissions` `{canUpload,canApprove}` contract (3 specs assert exact object).
- **Failure scenario:** Supporter+upload toggles package inactive (phase 2 success). `detail()` still 404s unless owner or approver (`prompt-library-query.service.ts:241`; skill `:248`; api `:257`). Actor cannot reopen the package they just hid. Approver still gets `isUpdate: true` on detail (`prompt-library-query.service.ts:253`) → FE Edit → `createVersion` 403. List inactive stays `canApprove`-only (`:145–149`) so creator/supporter cannot find the hidden row. `supporters: {id,email}[]` never appears because `loadPackageMeta` is not in the phase 2 file list.
- **Evidence:**
  - Plan: `phase-02-tighten-3-ws-edit-approve-status.md:36,42–45,58`; `brainstorm-summary.md:90,94`
  - `loadPackageMeta` (must grow a supporters map): `prompt-library-query.service.ts:35–51,193,270,525`; `skill-package-query.service.ts:37,200,287,555`; `api-catalog-query.service.ts:45,209,286,541`
  - Inactive list: prompt `:140–149`; skill `:142–151`; api `:150–157`
  - Inactive detail 404: prompt `:239–242`; skill `:246–249`; api `:257–258`
  - Inactive download/export twins: prompt `:631–634`; skill `:663–666`; api `:647–650`
  - `isUpdate` detail: prompt `:253`; skill `:268`; api `:269`; review rows prompt `:403`
  - `getMyPermissions` exact shape: `prompt-library-upload.service.ts:425–430` + spec `:704–717`; skill spec `:793–806`; api spec `:715–728`
- **Suggested fix:** One table of query call sites per WS: list statusFilter, detail 404, download 404, detail `isUpdate`, version `isUpdate`, reviews `isUpdate`. Hydrate `supporters` inside `loadPackageMeta` (3 methods × 3 call sites). Either add `canToggleStatus` / `canEditPending` to detail **or** strike them from the brainstorm. Do not change `getMyPermissions` "optional" (`phase-03:70`) without flipping the three exact-object specs.

## Finding 8: `listUsers` / `listStats` / `listLatest` / `ArtifactType` — split phases, missing public-contract callers

- **Severity:** High
- **Location:** Phase 5 Related Code Files; Phase 6 all
- **Flaw:** Coworker create needs the PIC picker. `GET /v1/asset-hub/users` is OR across 6 codes today. Phase 5 says "làm ở đây nếu picker cần lúc create"; phase 6 also owns it. If cook follows phase 5's "phase 6 cũng được", a `coworker_upload`-only user gets 403 on the picker during the only phase that ships POST `/items`. `listStats` / `listLatest` hardcode three workspaces and `ArtifactType = 'skill' | 'prompt' | 'api-catalog'`. Phase 6 TDD "4 phần tử, type `coworker`" / "key `coworkers`" does not name `ArtifactType`, the `listLatest` return type `{skills, prompts, apiCatalogs}`, or the stats spec's **3** `mockResolvedValueOnce` / `query.mock.calls[0|1|2]`. Adding a fourth fetch silently shifts the email-resolution query slot in `latest-artifacts.service.spec.ts`.
- **Failure scenario:** Phase 5 ships coworker POST; picker 403 for coworker-only roles → cannot set `responsible_user_ids` (still required min 1). Phase 6 adds coworker to `listStats` without updating `latest-artifacts-stats.service.spec.ts:29–35` (expects length 3) and `:84–88` (exactly 3 bound calls). `listLatest` spec `:39–46` assumes fetch order skill, prompt, api, emails — fourth workspace makes email mock attach to coworker SQL. Public `data.apiCatalogs` stays; `data.coworkers` added without a versioned contract note. FE out of scope, so this is an unannounced response-shape change on `GET /v1/asset-hub/stats` and `/latest`.
- **Evidence:**
  - Plan: `phase-05-coworker-apis-clone-prompt.md:42`; `phase-06-stats-picker-seed-docs.md:18–35,46–47`
  - `listUsers` codes: `asset-hub-catalog.controller.ts:48–56`; spec `asset-hub-catalog-perm.spec.ts:14–21`
  - `listStats` 3-way Promise.all: `latest-artifacts.service.ts:9,169–181`
  - `listLatest` 3 keys: `latest-artifacts.service.ts:187–197`
  - Stats spec 3 rows / 3 calls: `latest-artifacts-stats.service.spec.ts:29–35,53–56,84–88`
  - Latest spec mock order: `latest-artifacts.service.spec.ts:39–46,61,70–81`
- **Suggested fix:** Move picker codes into phase 5 (required for create). Phase 6 owns stats/latest only. Write the new public shapes: `ArtifactType` includes `'coworker'`; `listStats.data.length === 4`; `listLatest.data.coworkers`. List every spec assertion that encodes "3 workspaces" (stats `:29`, `:42`, `:84`; latest mock chain). Do not split one decorator across two phases.

## Finding 9: Cloning prompt is the plan's implementation strategy — it will drag `usage_guide` / tags / category / download / `code = prompt_<id>` into coworker

- **Severity:** High
- **Location:** Phase 5 Overview / Architecture / Risk; Phase 4 coworker `code`; Phase 6 latest SQL
- **Flaw:** Phase 5 is "TDD clone `prompt-library` query/upload/perm specs". Risk only mentions "DTO không extend `AssetHubItemMetaFieldsDto`". Prompt create **generates** `code: \`prompt_${id}\`` after insert (`prompt-library-upload.service.ts:98–99`). Coworker `code` is user-supplied unique (`phase-04:25`, `plan.md:31`). Clone will keep the placeholder-then-update pattern and ignore user `code`, or accept `code` and still overwrite it. Prompt bump DTO extends the meta DTO with `usage_guide_html` **required** (`asset-hub-item-meta-fields.dto.ts:57–60`). Perm spec clone includes download unless skipped — phase 5 says skip download, perm spec "1-1 prompt (trừ download)" with no list of prompt perm methods to drop. Phase 6 admits latest SQL must not select `prompt_content` but still says "clone prompt".
- **Failure scenario:** Coworker POST body with `code: 'ops-bot'` saved then overwritten to `coworker_12` → uniqueness/immutability acceptance fails. Clone of `CreatePromptPackageDto` requires `usage_guide_html` + `tag_ids` + `category_id` → 400 on the documented coworker payload. Clone of query `decorateCategory` / `stripGuide` touches columns that do not exist. Latest feed 500s if cook copies a prompt-specific SELECT (phase 6's own risk, unmitigated by a column allow-list).
- **Evidence:**
  - Plan: `phase-05-coworker-apis-clone-prompt.md:14,21–27,38–62,69`; `phase-04-coworker-schema-and-lookup-get.md:25`; `phase-06-stats-picker-seed-docs.md:53`; `plan.md:31,55`
  - Prompt generated code: `prompt-library-upload.service.ts:91–99`
  - Shared DTO requires guide + kind + PIC min 1, optional tags: `asset-hub-item-meta-fields.dto.ts:22–79`
  - Prompt perm method list (includes no-download? prompt has markdown download elsewhere): `prompt-library-perm.spec.ts:74–88` — coworker must **not** copy this list blindly
- **Suggested fix:** Stop saying "clone prompt". Write a coworker field matrix (package columns, version columns, DTOs, routes) as a table in phase 5, then copy **files** not **behavior**. Explicitly: persist user `code` as-is (trim), never `coworker_${id}`. No `usage_guide_html` / `tag_ids` / `category_id` on any coworker DTO. No `applyAssetHubCatalogFilters`. No GET download route, no perm spec row for it. Latest SELECT allow-list: `code, version_no, created_at, name, short_description, state, submitted_by` only.

---

## Scope cuts the planner must make before cook

1. Drop 4-table `HIERARCHY_MAP` / `OWNER_ALL_TABLES` work. SO ≠ records browser.
2. Do not land phase 2 without phase 3 in the same release. Prefer: do not tighten the 3 live WS in this plan.
3. Ship coworker first (Approach C). Supporters/SO as plan 2.
4. Replace every "clone prompt" / "update callers" with the inventories above.

## Unresolved questions

- Is a mid-plan deploy of phase 2 without phase 3 actually on the table? If yes, Finding 3 is a ship blocker. If cook always ships 1–6 together, the phase split is still wasted motion.
- Does product require SO implied verbs (`*_upload`/`*_approve`) or is a service-level `resource_owners` check enough? Implied verbs are the only reason child modules exist.
- Who consumes `GET /v1/asset-hub/stats` and `/latest`? Additive `coworker` key is still a contract change for typed clients.
