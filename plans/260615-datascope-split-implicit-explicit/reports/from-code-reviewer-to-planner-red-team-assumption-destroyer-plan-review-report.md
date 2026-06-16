---
title: "Red-Team Plan Review — DataScope Split Implicit/Explicit (Scope Auditor)"
role: code-reviewer (hostile / assumption-destroyer)
target_plan: 260615-datascope-split-implicit-explicit
date: 2026-06-15
---

# Red-Team Plan Review

Verification mode: SCOPE AUDITOR. All findings carry `file:line` citations or empty-grep evidence.

---

## Finding 1: Plan deletes `accessibleDataIds` from `RequestWithInfo` but ignores `RequestInfo` index signature — silent leak across 96 consumers

- **Severity:** High
- **Location:** Phase 5, "Type cleanup" + Phase 3, "RequestWithInfo type change"
- **Flaw:** `RequestInfo` is declared with a wildcard index signature `[key: string]: unknown` (`src/common/types/request-with-info.ts:16`). Removing the typed `accessibleDataIds` field from the interface does NOT cause `tsc` to flag leftover writes/reads — they fall through to the wildcard. Plan's success criterion "tsc strict pass → 0 occurrence" relies on the compiler catching stale references; the wildcard defeats that. Any controller, guard, or test path that still does `req.info.accessibleDataIds = …` or `req.info?.accessibleDataIds` will compile clean and silently break at runtime when service expects the new `scope` shape.
- **Failure scenario:** A guard in `src/common/guards/*` (10+ files import `RequestWithInfo`) or a test fixture sets `req.info.accessibleDataIds = [...]`. Phase 5 removes the typed field. tsc passes because of the index signature. Production runs, interceptor never populates `dataScope` for that route (e.g. a route uses different interceptor wiring), service receives `scope: undefined`, ts-strict optional check passes — caller passes `req.info?.dataScope ?? null` per Phase 5 → service gets `null` (admin path) → **unauthorized data leak.**
- **Evidence:**
  - `src/common/types/request-with-info.ts:16` — `[key: string]: unknown;`
  - `grep -rn "RequestWithInfo\|RequestInfo" src/ --include="*.ts" | wc -l` → 96 consumer references outside `request-with-info.ts`.
  - Plan phase-05 line 82: "0 occurrence of accessibleDataIds in src/" — relies on grep not on tsc.
- **Suggested fix:** Either (a) remove the `[key: string]: unknown` escape hatch as part of this plan, (b) keep a deprecated `accessibleDataIds?: never` discriminator so writes hard-fail tsc, or (c) make the controller fallback `?? null` an *explicit assertion* with a runtime check `if ('accessibleDataIds' in req.info) throw` for safety windows. The grep gate alone is insufficient — the wildcard kills tsc enforcement.

---

## Finding 2: Resolver for transform-file writes `accessibleDataIds` BYPASSING the interceptor — Phase 3's "interceptor doesn't set it" claim is meaningless here

- **Severity:** Critical
- **Location:** Phase 3, "Requirements / Functional" ("`req.info.accessibleDataIds` KHÔNG còn được set bởi interceptor.") and Phase 4 migration matrix (only lists `assertCanAccess` rewrite).
- **Flaw:** `DiagnosticTransformFileResolver.authorize()` populates `request.accessibleDataIds` *directly* from `PermissionCacheService.getAccessibleRecords` (it does NOT go through the interceptor — `transform-file` controller routes are `/media/transform-file/:id` and `/admin/media/transform-file/:id`, not decorated with `@RequireDataAccess`). The plan's invariant "interceptor is the sole producer of accessibleDataIds/dataScope" is false. Phase 4 assumes assertCanAccess can be rewritten "via applyDataScope in main query" — but the resolver does NOT compose its own DB query for diagnostic-report fetch; it calls `reportRepo.findOne({ where: { id, is_deleted: false } })` (no QueryBuilder), and history goes through `historyRepo.findOne` with relations. Plan's "rewrite to applyDataScope in main query" requires a structural refactor (replace `findOne` with createQueryBuilder + applyDataScope) that is not enumerated in Phase 4 implementation steps.
- **Failure scenario:** Phase 4 rewrites `assertCanAccess` to take `scope`. Resolver call site at `diagnostic-transform-file.resolver.ts:54` still loads via `getAccessibleRecords` (explicit grants only, no owner-roots, no denies). Plan removes `accessibleDataIds` field in Phase 5. Resolver now has no place to stash the scope, but `authorize()` doesn't have owner-root info anyway — meaning **owner-scoped users can no longer download files via transform-file because authorize-time only loads explicit grants**, and that was already broken pre-plan (per memory note "SO Owner Implicit Permission shipped"). Plan does not flag this regression.
- **Evidence:**
  - `src/modules/bi-hub-diagnostic-report/diagnostic-transform-file.resolver.ts:54` — `request.accessibleDataIds = await this.permissionCache.getAccessibleRecords(...)` (NOT interceptor).
  - `src/common/transform-file/transform-file.controller.ts:30,42` — routes `media/transform-file/:id`, `admin/media/transform-file/:id` use only `BearerGuard, IsMaintenanceGuard` — no `@RequireDataAccess`.
  - `src/modules/bi-hub-diagnostic-report/diagnostic-transform-file.resolver.ts:75-77` — `reportRepo.findOne({ where: { id, is_deleted: false }, relations: [...] })` — not a QueryBuilder; applyDataScope cannot attach.
- **Suggested fix:** Phase 4 must either (a) refactor the resolver to compose `createQueryBuilder` + `applyDataScope`, OR (b) add a dedicated `resolveDataScopeForUser(userId, tableName)` method that the resolver calls (parallel to interceptor) — the plan currently lists 1 line "rewrite assertCanAccess as SQL existence check" which under-estimates the change. Also Phase 3's invariant "interceptor is the sole writer" must be qualified: "interceptor + DiagnosticTransformFileResolver.authorize"; OR remove the dual-writer and route transform-file through the interceptor.

---

## Finding 3: `HIERARCHY_MAP` depth claim (max 4) is wrong — real depth requires `walkUp` to traverse 3 hops, plan tests only 2

- **Severity:** High
- **Location:** Phase 1, Risk Assessment ("Loop guard: max 10 hops. … HIERARCHY_MAP depth max = 4") and Phase 1 test list (only `1-hop` and `2-hop` cases).
- **Flaw:** Plan's test matrix covers `bi_hub_diagnostic_reports → bi_hub_bicc_departments` (1-hop) and `ma_tool_documents → ma_tool_templates → ma_tool_workspaces` (2-hop). But `bi_payment_other_files → bi_payment_checklists → bi_payment_programs → bi_payment_projects` is **3 hops**, and `bi_payment_work_steps → bi_payment_programs → bi_payment_projects` is 2 hops. Plan says `ROOT_OWNER_CONFIG` currently covers only `bi_hub_bicc_departments` and `ma_tool_workspaces` (excludes `bi_payment_projects`), so "walkUp 3-hop" is technically never reached today — BUT plan §3.6 mentions "Áp dụng được cho mọi root sau này không sửa thêm" implying future inclusion. Helper unit-test coverage at 1- and 2-hop only is a regression trap when bi_payment is enabled.
- **Failure scenario:** Future PR adds `bi_payment_projects` to `ROOT_OWNER_CONFIG`. `applyDataScope` is called for `bi_payment_other_files` with `rootTable=bi_payment_projects`. `walkUp` builds 3-hop chain. `buildExistsSubquery` (per Phase 1 sketch) emits 3 aliases `__ds_t1_…, __ds_t2_…, __ds_t3_…` with chained INNER JOIN. Whether the alias chaining in the sketch (`${aliases[i-1]}."${chain[i].fkColumn}"`) is correct at 3-hop has never been tested. Bug shows only in prod.
- **Evidence:**
  - `src/modules/data-access/constants/hierarchy-config.ts:20-25` — bi_payment chain: `projects → programs → work_steps | checklists → other_files`. Max depth `other_files → checklists → programs → projects` = 3 hops.
  - Phase 1 test list (phase-01-types-and-helper.md lines 167-177) — tests for "owned 1-hop" and "owned 2-hop" only.
  - Phase 1 sketch lines 86-99 — `buildExistsSubquery` chain logic with `chain[i].fkColumn` indexing has off-by-one risk at deeper chains; not unit-covered.
- **Suggested fix:** (a) Add a "3-hop chain" test case using a synthetic HIERARCHY_MAP fixture (no live table needed since `getQueryAndParameters` builds metadata-only SQL). (b) Or explicitly scope-limit: assert `chain.length ≤ 2` at runtime and throw — narrows future YAGNI surface to known scope.

---

## Finding 4: `buildExistsSubquery` sketch has FK column off-by-one — references `chain[i].fkColumn` for the JOIN ON clause where it should be `chain[i+1].fkColumn` (or `chain[i].fkColumn` of previous iteration)

- **Severity:** Critical
- **Location:** Phase 1, "Helper internals" code sketch lines 86-99.
- **Flaw:** Read the sketch carefully:
  ```
  chain.forEach((hop, i) => {
    if (i === 0) sql += `  FROM "${hop.parentTable}" ${aliases[i]}\n`;
    else sql += `  INNER JOIN "${hop.parentTable}" ${aliases[i]} ON ${aliases[i]}.id = ${aliases[i-1]}."${chain[i].fkColumn}" AND ...`;
  });
  sql += `  WHERE ${aliases[0]}.id = ${rootAlias}."${chain[0].fkColumn}"\n`;
  ```
  `chain` is built by `walkUp` as `[{childTable, parentTable, fkColumn}, ...]` walking upward. `chain[0]` = `{child: tableName, parent: tableName's parent, fkColumn: tableName.<fk>}`. The WHERE links `aliases[0].id = rootAlias.<chain[0].fkColumn>` — correct (rootAlias = the consumer's table = tableName; its FK column → first parent.id).

  But for the inner JOIN at `i ≥ 1`: it joins `chain[i].parentTable` (which is the grandparent) onto `aliases[i-1]` (which is the parent table — `chain[i-1].parentTable`). The FK column on the parent table that points to the grandparent is `chain[i-1].parentTable`'s entry in HIERARCHY_MAP, which is `chain[i].fkColumn`. So `aliases[i-1]."${chain[i].fkColumn}"` — semantically tries to read grandparent's FK *column* from the parent row.

  **Verify by example:** `ma_tool_documents → templates → workspaces`. `walkUp('ma_tool_documents', 'ma_tool_workspaces')` returns:
    - `chain[0] = {child: ma_tool_documents, parent: ma_tool_templates, fkColumn: template_id}`
    - `chain[1] = {child: ma_tool_templates, parent: ma_tool_workspaces, fkColumn: workspace_id}`

  WHERE clause: `aliases[0].id = rootAlias.template_id` → templates.id = documents.template_id. Correct.
  JOIN at i=1: `INNER JOIN ma_tool_workspaces __ds_t2_xx ON __ds_t2_xx.id = aliases[0].workspace_id`. `aliases[0]` = `__ds_t1_xx` = templates alias. So `templates.workspace_id` → correct. The sketch actually IS correct here.

  HOWEVER — the sketch is misleadingly indexed and easy to break in implementation. The bigger concern: the sketch then writes `${aliases[aliases.length - 1]}.id = ANY(:${paramName})` — verifying the deepest alias's id is in rootIds. `aliases.length` == `chain.length`. For chain.length=2, aliases = [__ds_t1, __ds_t2]; `aliases[1].id = workspaces.id` — correct.

  Re-reading: **the sketch is correct for the documented examples**, but the alias-vs-index dance is brittle. The hidden bug: `walkUp` returns `[]` for `tableName === rootTable`, and the sketch's `if (chain.length === 0) ors.push(...)` short-circuits — but in the multi-hop path, if `walkUp` returns `null` (e.g. tableName not reachable), the predicate fallback "chỉ còn explicit" is silently applied (lines 132-135). **No log, no metric, no exception.** Misconfigured table = user sees only their explicit grants, owner branch silently dropped — looks like "access denied" UX but is actually a config bug.
- **Failure scenario:** Engineer adds new table to `HIERARCHY_MAP` but forgets to wire its root into `ROOT_OWNER_CONFIG`, OR sets parent wrong so `walkUp` exits the loop without reaching root. Interceptor passes `scope.ownedRoots = { rootTable: 'X', rootIds: [1,2] }` but `applyDataScope` for the misconfigured table silently emits `WHERE (explicit_predicate)` — owner branch dropped. SO user reports "I can't see my docs" — debugging requires reading the helper internals to discover the silent fallback.
- **Evidence:**
  - phase-01-types-and-helper.md lines 76-84 — `walkUp` returns `null` on no-reach.
  - phase-01-types-and-helper.md lines 127-136 — silent fall-through when `chain === null`.
  - phase-01-types-and-helper.md line 138 — only "1 = 0" if BOTH branches missing, but not if owner branch alone fails.
- **Suggested fix:** Log a warning (with tableName + rootTable) when `walkUp` returns null; or throw in dev/CI mode + log in prod. Add explicit test case for "tableName not reachable from claimed rootTable" verifying the log/throw.

---

## Finding 5: `request(app)` integration test infrastructure is `test/app.e2e-spec.ts` — Phase 6's "supertest with JWT tokens" assumes infrastructure that does not exist at this scope

- **Severity:** High
- **Location:** Phase 6, "Integration test outline" + "Risk Assessment: Existing test infrastructure likely already supports."
- **Flaw:** Plan writes integration tests using `request(app).get(...).set('Authorization', `Bearer ${soToken}`)` and assumes the test bootstrap exists. The actual repo has ONE e2e file (`test/app.e2e-spec.ts`) — 22 lines, hitting `/` and returning "Hello World!". No JWT signing utility, no seed scripts, no token mint helper, no `.env.test`. The integration spec itself (`src/common/authorization/__tests__/so-owner-scope-integration.spec.ts`) is NOT a supertest test — it mocks `dsQuery` directly and constructs guard/interceptor instances. Phase 6 quietly migrates from mock-based "integration" to real-HTTP integration without listing the supporting infrastructure work.
- **Failure scenario:** Phase 6 lead reads test stub, writes `request(app)`. App bootstrap fails because the project has no `.env.test` Redis URL and no DB seeding harness for `bicc_departments`, `bi_hub_diagnostic_reports`, `users`, `roles`, `resource_owners`, `user_roles`. Tester reports "BLOCKED — no infra"; plan says effort 3h; reality is 1-2 days of harness setup. Sprint blown.
- **Evidence:**
  - `ls test/` → only `app.e2e-spec.ts` + `jest-e2e.json`.
  - `test/app.e2e-spec.ts:18` — `request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');` — only existing pattern.
  - `src/common/authorization/__tests__/so-owner-scope-integration.spec.ts:1-20` — file is mock-based, no HTTP layer.
- **Suggested fix:** Either (a) downgrade Phase 6 integration test to mock-based pattern matching the existing `so-owner-scope-integration.spec.ts` (extend it, don't rewrite as supertest), OR (b) add an explicit "Phase 6a — Build supertest harness with seeded DB" sub-phase with realistic effort estimate (probably 8-12h).

---

## Finding 6: Plan claims "~14 source files + 3 test files" but `ALLOWED_TABLES` covers 11 tables, `@RequireDataAccess` could be on tables outside the audited list

- **Severity:** Medium
- **Location:** brainstorm-summary.md §3.6 ("Total: ~14 source files + 3 test files + 1 doc.") + Phase 5, controller list (3 controllers, 11 endpoints).
- **Flaw:** Brainstorm assumed only bi-hub-diagnostic-report and bicc-department consume `accessibleDataIds`. Grep confirms that list is complete for `req.info.accessibleDataIds` (consumers in `src/modules/`). HOWEVER, `accessibleDataIds` also appears in `src/common/transform-file/transform-file.types.ts:9` and is consumed by `DiagnosticTransformFileResolver`. Plan acknowledges `transform-file.types.ts` rename but the resolver's authorize() PATH (Finding 2 above) was not properly traced in the scope audit. Additionally, `src/common/authorization/helpers/data-access-scope.helper.ts` (`applyDataAccessScope`) is an EXISTING helper performing IN-list filter — plan never says whether to delete, deprecate, or co-exist. The new `applyDataScope` overlaps in name and intent.
- **Failure scenario:** After plan ships, a future contributor sees both `applyDataAccessScope` (in `common/authorization/helpers/`) and `applyDataScope` (in `modules/data-access/helpers/`) and is unsure which to use. The old helper accepts `number[]`, the new accepts `DataScope | null`. Wrong import → owner branch never applied → silent under-permissioning OR over-permissioning depending on call site.
- **Evidence:**
  - `src/common/authorization/helpers/data-access-scope.helper.ts:3-11` — existing helper, same purpose, IN-list pattern.
  - `src/common/authorization/index.ts:8` — re-exports it.
  - `src/common/authorization/__tests__/data-access-scope.helper.spec.ts:1` — tests for the old helper.
  - Plan never mentions this file in any phase's "Modify" or "Delete" list.
- **Suggested fix:** Add to Phase 5 (or 2): "Delete `applyDataAccessScope` helper and its spec since `applyDataScope` supersedes." If kept for legacy reasons, mark `@deprecated` with link to the new helper.

---

## Finding 7: `qb.setParameter(p, scope.explicit)` with array param for `= ANY(:p)` — TypeORM behavior with PG array binding is asserted but never grep-verified

- **Severity:** High
- **Location:** Phase 1, helper sketch lines 122-124, 131-132, 143-144.
- **Flaw:** Plan uses `qb.setParameter('dsExplicit_xx', [1,2,3])` then writes raw SQL `${alias}.id = ANY(:dsExplicit_xx)`. TypeORM's `setParameter` does NOT auto-convert JS arrays to PG arrays for raw SQL — that conversion happens only with the spread shorthand `IN (:...ids)` which TypeORM rewrites. Existing repo evidence: `src/modules/sbv-rpt-cvt-output/sbv-rpt-cvt-output.service.ts:117` uses `WHERE lnk.group_permission_id = ANY($1)` via raw `connection.query` (positional param, not `setParameter`). `src/common/authorization/services/owner-scope-resolver.service.ts:160` also uses raw `ds.query(... ANY($1) ...)`. **No grep hit in the repo for `setParameter` + `ANY(:)` pattern via QueryBuilder.** Plan's approach is unverified by precedent.

  Reality: TypeORM's `setParameter` with an array param + raw SQL `ANY(:p)` typically works because pg driver auto-binds arrays to PG arrays, but with caveats:
  1. Empty arrays may emit literal `'{}'::text[]` requiring explicit casting (`= ANY(:p::int[])`).
  2. With ts-strict, the param type drives binding — if the array is typed `number[]` it usually works.
  3. With nested QueryBuilder + cached query, TypeORM may quote array params as text — needs verification.

  Plan's Phase 1 test technique relies on `getQueryAndParameters()` which doesn't actually execute SQL — it only emits SQL string + bound param list. Empty array edge case (`scope.explicit = []` is explicitly handled by `if (noExplicit)`, so won't hit) — OK. But there's no test that the helper actually runs against a real PG.
- **Failure scenario:** Unit tests pass (metadata-only `getQueryAndParameters`). Real Phase 6 integration test against PG fails with `ERROR: operator does not exist: integer = text[]` or "syntax error at or near ANY". Diagnosis takes hours because the helper-level unit tests gave false confidence.
- **Evidence:**
  - `grep "qb.setParameter\b" src/` → empty.
  - Existing repo PG array binding only via `connection.query`/`ds.query` (positional `$1`): `src/common/authorization/services/owner-scope-resolver.service.ts:160`, `src/modules/sbv-rpt-cvt-output/sbv-rpt-cvt-output.service.ts:117`.
  - `src/common/authorization/helpers/data-access-scope.helper.ts:10` — existing IN-list helper uses `IN (:...accessibleIds)` spread (not ANY).
- **Suggested fix:** Add a smoke test in Phase 1 that ACTUALLY executes against a real PG (testcontainer or local) for at least one scope shape — verifying the SQL `ANY(:p)` binding works. Alternatively, switch helper to `IN (:...listName)` spread pattern matching the existing codebase precedent (slower compile but proven).

---

## Finding 8: Phase 3's "Risk Mitigation — fail soft (admin behavior)" silently grants UNRESTRICTED access during Phase 4 migration window

- **Severity:** Critical
- **Location:** Phase 3, Risk Assessment row 1.
- **Flaw:** Plan says: "Services trong Phase 4 vẫn còn đọc `accessibleDataIds` chưa migrate | OK, giữ field tạm trong RequestWithInfo (chưa xóa). Interceptor không set nữa → các service đó tự nhiên thấy `undefined` → fail soft (admin behavior)."

  This is a **dangerous mitigation**. Read existing service code:
  - `bi-hub-diagnostic-report.service.ts:43` — `if (accessibleDataIds && accessibleDataIds.length > 0)` — applies filter only if defined. **If undefined → no filter → returns ALL records.**
  - `bi-hub-diagnostic-report-write.service.ts:101` — `if (accessibleDataIds && !accessibleDataIds.includes(id)) throw` — if undefined → no check → **update succeeds for any record.**
  - `bicc-department.service.ts:31` — same.

  Plan ships Phase 3 (interceptor stops setting `accessibleDataIds`), but services through Phase 4 still expect it. The plan calls this "fail soft (admin behavior)" — it's actually **fail-open permissions**: any non-admin user can read/write/delete ANY record while the PR is mid-flight. The "Phase 3 alone" diff is a security hole.
- **Failure scenario:** Phase 3 commit lands in `main` (even momentarily — review during code review, dev environment, branch deploy). Bearer-token non-admin user requests `GET /v1/bi-hub/diagnostic-report/list` → service sees `accessibleDataIds === undefined` → returns ALL reports across the org. **Data leak window.**
- **Evidence:**
  - `src/modules/bi-hub-diagnostic-report/bi-hub-diagnostic-report.service.ts:32-44` — early return on `=== 0`; `IN (...)` only `> 0`; undefined → unfiltered.
  - `src/modules/bi-hub-diagnostic-report/bi-hub-diagnostic-report-write.service.ts:101,159,168,193,205` — all undefined → bypass.
  - `src/modules/bicc-department/bicc-department.service.ts:31-33,51-52` — same pattern.
- **Suggested fix:** **MUST squash Phases 3+4+5 into a single PR.** Plan must explicitly state "Phase 3-5 are non-divisible; landing only Phase 3 ships a security bug." Alternatively: in Phase 3, change interceptor to populate BOTH `accessibleDataIds` (legacy) AND `dataScope` (new) until Phase 5 deletes legacy. Plan's current "fail soft = admin behavior" framing must be corrected.

---

## Finding 9: `findOne` rewrite from 404 leak — plan asserts "404 not 403" but existing `details(id, accessibleDataIds)` returns 403 ("Out of scope") — silent contract change to API consumers

- **Severity:** Medium
- **Location:** Phase 4 migration matrix "findOne → throw NotFoundException" + brainstorm-summary.md §4.2 ("findOne returns 404 (không 403)").
- **Flaw:** Existing `bicc-department.service.ts:51-52` throws `ForbiddenException('Out of scope')` (HTTP 403) when scoped-out. Plan rewrites to `NotFoundException` (HTTP 404) — a public API contract change. Front-end / external consumers that route 403 → "logout/re-auth" UX, and 404 → "broken link" UX, will behave differently. Same for `bi-hub-diagnostic-report.service.ts:82` which throws `NotFoundException` (matches plan, no change there).

  Plan calls this "no leak existence" which is a security-best-practice — fine in principle — but it's a behavior change that warrants a callout under "API Contracts" / "Breaking Changes" section. Plan does not mark it as breaking. Front-end repo (out of scope) may break or produce confusing UX.
- **Failure scenario:** Frontend has logic `if (err.status === 403) router.push('/login')`. Post-deploy, scoped-out user sees broken-link page instead of being re-prompted. Customer-support ticket spike.
- **Evidence:**
  - `src/modules/bicc-department/bicc-department.service.ts:51-52` — `throw new ForbiddenException('Out of scope')`.
  - phase-04-services-migration.md line 88 — `if (!found) throw new NotFoundException();`.
  - Plan's "Out of Scope" section does NOT mention public API contract change.
- **Suggested fix:** Add to plan.md "Breaking Changes" section listing the 403→404 contract change for at minimum `bicc-department.details`. Coordinate with FE before deploy. Or preserve 403 for bicc-department by passing through current ForbiddenException semantic.

---

## Finding 10: `download` endpoint's `download_type === 'ALL'` ships ALL records when `accessibleDataIds === undefined` — plan's rewrite path doesn't address admin's separate code branch

- **Severity:** Medium
- **Location:** Phase 4 migration matrix `download(query, res, accessibleIds) → applyDataScope on qb` (one line).
- **Flaw:** Existing `download()` at `bi-hub-diagnostic-report-write.service.ts:182-215` has TWO branches: `download_type='ALL'` and `download_type='MULTIPLE'`, each with its own `accessibleDataIds` handling. The "ALL" branch only filters if `> 0` (otherwise empty); the "MULTIPLE" branch filters the user-supplied id array. Plan's one-line "use applyDataScope on qb" treats it as a single read but ignores the MULTIPLE branch's `idArr = idArr.filter(...)` JS-side check pattern, which must be replaced by a `WHERE id = ANY(:requested) AND <scope>` predicate. Plan also doesn't specify what happens when admin (scope === null) hits MULTIPLE branch — current code says `if (accessibleDataIds)` so undefined = no filter = all listed IDs returned. New code with `scope === null` no-ops the helper → same behavior. But empty-explicit + empty-owned for non-admin → helper emits `1=0` → empty xlsx. Plan's `if (accessibleDataIds?.length === 0) return empty` early return is dropped; new behavior also returns empty (via `1=0`), but the EXCEL file is generated with 0 rows vs the old code's `return exportExcelToResponse(... rows: [] )` early return. Minor behavior diff but plan must call out.
- **Failure scenario:** Excel export endpoint emits a fully-decorated empty xlsx instead of the previous early-return pattern. Performance slightly degraded; not a correctness bug but plan doesn't document the behavior reshape.
- **Evidence:**
  - `src/modules/bi-hub-diagnostic-report/bi-hub-diagnostic-report-write.service.ts:193-206` — dual-branch handling.
  - phase-04-services-migration.md "Migration matrix" row for `download` says only "use applyDataScope" — does not address MULTIPLE branch ID-array intersection.
- **Suggested fix:** Phase 4 must explicitly enumerate the MULTIPLE branch rewrite: replace `idArr = idArr.filter(id => accessibleDataIds.includes(id))` with `qb.andWhere('report.id = ANY(:requested)', { requested: idArr })` + `applyDataScope(qb, ...)`. Document the empty-xlsx behavior change.

---

## Finding 11: `transform-file.types.ts` is in the pending plan `260518-generic-transform-file-common` — merge-conflict risk minimized by current state but plan still asserts "rename field" without confirming destination path

- **Severity:** Medium
- **Location:** plan.md "Cross-plan notes" + Phase 4-5 "transform-file.types.ts" modification.
- **Flaw:** Plan says: "Touch điểm chung `src/common/transform-file/transform-file.types.ts` (chứa `accessibleDataIds`). Nếu plan đó vẫn chưa ship khi plan này merge: rename/clean field cùng lúc. Nếu đã ship: chỉ cần cleanup field." Grep confirms `transform-file.types.ts` already exists in `src/common/transform-file/` (i.e. plan 260518 has at least partly landed since the file is here). Plan should not have a conditional — it should hard-state "file is at `src/common/transform-file/transform-file.types.ts`, modify there." More importantly, plan 260518 phase-02 (line 62) describes loading `accessibleDataIds` inside the resolver — meaning the 260518 plan itself currently codifies the legacy pattern. Removing the field while 260518 is in-flight (status pending or partially shipped) requires coordination — plan does not list a coordination check.
- **Failure scenario:** Plan ships Phase 5 (delete `accessibleDataIds` from `transform-file.types.ts`), but the 260518 plan's phase-02 (still pending) references the field. Whoever lands the merged result later sees stale plan docs and re-introduces the field. Or the pending plan branch has a conflict with this one's deletions, slowing the merge.
- **Evidence:**
  - `src/common/transform-file/transform-file.types.ts:9` — `accessibleDataIds?: number[];` currently lives in common.
  - `plans/260518-generic-transform-file-common/phase-02-move-diagnostic-resolver-and-add-self-auth.md:62` — pending plan still references the field.
  - No coordination/communication step in plan.md.
- **Suggested fix:** Add explicit pre-Phase-5 checklist: "Confirm with 260518 owner that pending phases will switch to `dataScope` after this plan lands, OR amend 260518's phase docs to remove `accessibleDataIds` reference."

---

## Summary

- **11 findings** total.
- **3 Critical** (Findings 2, 4, 8): fail-open security window between Phase 3 & 4, transform-file dual-writer not handled, silent owner-branch drop on misconfigured tables.
- **4 High** (Findings 1, 3, 5, 7): tsc enforcement broken by index signature, HIERARCHY_MAP 3-hop untested, integration test infra missing, `setParameter` + `ANY(:)` unverified pattern.
- **4 Medium** (Findings 6, 9, 10, 11): name collision with `applyDataAccessScope`, 403→404 contract change, `download` dual-branch rewrite under-specified, cross-plan coordination missing.

## Unresolved Questions

- Does `qb.setParameter` with `number[]` + raw `ANY(:p)` actually work against the project's PG version, or does it need explicit cast (`::int[]`)? Decision: smoke test in Phase 1 or fall back to `IN (:...spread)`.
- Should Phase 3 dual-write (`accessibleDataIds` legacy + `dataScope` new) to remove the fail-open security window between phases, or commit to single-PR squash for Phases 3-5?
- Is the resolver-level transform-file path (Finding 2) in scope, or should it be split to a follow-up plan?
- Front-end coordination for 403→404 contract change (Finding 9): who owns the comm?
