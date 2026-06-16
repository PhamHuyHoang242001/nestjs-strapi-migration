---
from: code-reviewer
to: planner
role: red-team SCOPE & COMPLEXITY CRITIC (YAGNI ENFORCER)
verification_method: CONTRACT VERIFIER (grep-verified caller counts + file:line)
plan: plans/260615-datascope-split-implicit-explicit
date: 2026-06-15
---

# Red Team Review — Scope & Complexity Critic

## Verified Caller Inventory (CONTRACT VERIFIER baseline)

### `getOwnerScopedIds` (Phase 2 deletes)
Production callers: **1**
- `src/common/authorization/interceptors/data-access.interceptor.ts:37`
Test callers: 6 in `__tests__/data-access-interceptor-with-owner.spec.ts`, 5 in `__tests__/owner-scope-resolver.service.spec.ts`, 1 comment in `__tests__/so-owner-scope-integration.spec.ts:131`

### `accessibleDataIds` field (Phases 4–5 cleanup)
Production write sites: **2** (interceptor.ts:42, resolver.ts:54)
Production read sites in services: **17** across 4 files
Production controller forwards: **11** (admin: 4, user: 5, bicc-dept: 2) — matches plan claim
Type sites: **2** (`request-with-info.ts:13`, `transform-file.types.ts:9`)
Test sites: 13 across 3 spec files

### `findRootTable` (helper reused by plan)
- Defined: `src/modules/data-access/helpers/owner-scope-helpers.ts:7`
- Already imported in `owner-scope-resolver.service.ts:15`
- Reuse is correct, but cross-module helper boundary means new helper file at `modules/data-access/helpers/data-scope-applier.ts` couples authorization back to data-access (concern flagged below)

### Caller counts MATCH plan claims. No phantom call sites.

---

## Finding 1: Phase 6 plans to "rewrite" a file that does not exist

- **Severity:** High
- **Location:** Phase 6, sections "Functional / Docs `so-permission-guide.html` §4 + §7 rewrite", "Implementation Steps step 3", "Success Criteria"
- **Flaw:** `docs/so-permission-guide.html` is referenced 8+ times across phase-06 (and 2x in plan.md, 1x in brainstorm-summary §6) as a required deliverable to rewrite. The file does not exist in the repo.
- **Failure scenario:** `find . -name "so-permission-guide*" -type f` returns nothing. Phase 6 cannot mark "Success Criteria" complete because there is no file at the claimed path. Implementer wastes time hunting for it or writes a brand-new HTML file out of nothing, expanding scope beyond what was estimated (3h effort for Phase 6).
- **Evidence:**
  - phase-06-integration-tests-and-docs-rewrite.md:14, 26-32, 84-99, 110-117, 123-127 all reference `docs/so-permission-guide.html`
  - plan.md:6 ("Supersedes: §4 Read endpoint + §7 Service layer of `docs/so-permission-guide.html`")
  - `find . -name "so-permission-guide*" -type f 2>/dev/null` → empty
  - `ls docs 2>/dev/null` → empty (no `docs/` directory exists at root)
- **Suggested fix:** Either (a) drop docs rewrite entirely from this plan — it's not a regression to ship code without it; or (b) explicitly call out "docs file does not exist; deferred" and remove from Phase 6 success criteria; or (c) verify path and update references. As written, "rewrite §4 + §7" is impossible to satisfy.

---

## Finding 2: `Math.random()` suffix is YAGNI armor for a non-existent threat

- **Severity:** Medium
- **Location:** Phase 1, sections "Param naming uses random 8-char suffix to avoid collision when helper called nested/multiple times" + `randomSuffix()` impl
- **Flaw:** `Math.random().toString(36).slice(2, 10)` exists solely to avoid TypeORM param-name collision when `applyDataScope` is called multiple times on the same `qb`. Grep shows ZERO call sites in the entire codebase that need this — every plan-listed call site is a single invocation per service method (findAll, findOne, deleteMany, etc.). No nested usage. No multi-apply scenario.
- **Failure scenario:** Implementer writes a `randomSuffix()` helper, 10 unit tests including "Test 10: param suffix unique trên 2 lần gọi liên tiếp" (phase-01:177) testing a property no production code exercises. Test 10 has nondeterministic failure risk because `Math.random()` CAN collide (~1 in 36⁸ ≈ 1 in 2.8B, but on flaky CI this is real over 100k runs). Phase-01 Risk Assessment line 213 acknowledges "Random suffix có thể collide ở test (Math.random determinism)" — knowingly introduces a flake to test a property that has no consumer.
- **Evidence:**
  - phase-01-types-and-helper.md:29 ("Param naming uses random 8-char suffix to avoid collision when helper called nested/multiple times")
  - phase-01-types-and-helper.md:101-103 (`randomSuffix` impl)
  - phase-01-types-and-helper.md:177 (Test 10)
  - phase-01-types-and-helper.md:213 (acknowledged flake risk)
  - `grep -rn "Math.random" src/` shows random only used in `uploads.controller.ts` for filenames — no precedent for QueryBuilder params
  - All proposed service rewrites in Phase 4 call `applyDataScope(qb, alias, table, scope)` exactly once per method body
- **Suggested fix:** Drop the suffix. Use fixed param names `dsExplicit`, `dsOwned`, `dsDeny`. If the unlikely future need arises (nested call), add suffix THEN. Removes ~5 lines of impl, 1 test case, 1 acknowledged flake source.

---

## Finding 3: `getOwnedRoots` is dead-weight ceremony for a 2-line filter

- **Severity:** Medium
- **Location:** Phase 2, section "Diff sketch" (lines 41-51) + entire Phase 2 (2h effort allocation)
- **Flaw:** The new `getOwnedRoots(userId, rootTable)` is a 3-line wrapper around `getUserOwnerScope(userId).filter(...).map(...)`. The interceptor (Phase 3 sketch line 92-96) already destructures into `[explicit, ownedRootIds, denies]` — it could call `getUserOwnerScope` directly and filter inline. Adding a new public method that JUST filters cached output to please "service layer abstraction" inflates the resolver public surface without giving anything back. The cache-hit assertion test (phase-02:78) tests that calling a 1-liner twice doesn't hit DB twice — which is `getUserOwnerScope`'s contract, NOT `getOwnedRoots`'s.
- **Failure scenario:** Phase 2 gets allocated 2h for a 5-LOC change + 4 unit tests, all of which duplicate the existing `getUserOwnerScope` cache test. Future readers see a method named `getOwnedRoots` and assume it has its own cache key — it doesn't.
- **Evidence:**
  - Existing `getUserOwnerScope` already cached at `owner-scope-resolver.service.ts:46-80`
  - Brainstorm §3.2 says "đọc cache `getUserOwnerScope`, filter theo rootTable" — exactly what inline would do
  - Phase 3 sketch already inlines the filter conceptually: `rootTable ? this.ownerScope.getOwnedRoots(userId, rootTable) : Promise.resolve([] as number[])` — could be `(await this.ownerScope.getUserOwnerScope(userId)).filter(s => s.rootTable === rootTable).map(s => s.rootId)` directly
  - `getOwnerScopedIds` callers verified: 1 production caller (interceptor.ts:37). After Phase 3 rewrites it, the method has 0 callers and CAN just be deleted without an "ADD replacement" step
- **Suggested fix:** Merge Phase 2 into Phase 3. Just delete `getOwnerScopedIds` and inline the filter in the interceptor. Saves a phase, a public-API expansion, and 2h of estimated effort.

---

## Finding 4: Manual SQL string-building duplicates an existing helper one directory away

- **Severity:** High
- **Location:** Phase 1, section "Helper internals" (`buildExistsSubquery`, `walkUp`, `appendJoinChain` mentioned in brainstorm §3.4)
- **Flaw:** `src/modules/data-access/helpers/owner-scope-helpers.ts:24-65` ALREADY has `buildOwnerJoinChain` that walks `HIERARCHY_MAP`, builds JOIN strings with the same `t0/t1/tN` aliasing, handles `deleted_at IS NULL`, etc. The "anti-pattern" claim in plan.md:21-27 was specifically about transitive-closure materialization (the IN-list flat array), not about the JOIN walker. The plan throws away `buildOwnerJoinChain` (renaming alias prefix from `t0` to `__ds_t0_<suffix>`) and rewrites the same walking logic from scratch in `data-scope-applier.ts`. Two helpers will now walk the same map with two slightly different alias conventions.
- **Failure scenario:** HIERARCHY_MAP gets a new entry (e.g., bi_payment subtree owner config added). Engineer updates `buildOwnerJoinChain` for the data-access list endpoint. Two months later, EXISTS subquery in `data-scope-applier.ts` silently emits wrong SQL because the second walker was not updated. Bug only surfaces when test coverage for the new table happens to exercise the EXISTS path. Worse: `OwnerScopeResolverService.isInOwnedScope` (still kept per plan) has a THIRD copy of the same walk at lines 181-211. Plan ends with three independent implementations of chain-walking.
- **Evidence:**
  - `src/modules/data-access/helpers/owner-scope-helpers.ts:24-65` `buildOwnerJoinChain` — walks `HIERARCHY_MAP`, emits INNER JOIN chain string with `t0/t1/tN` aliases
  - `src/modules/data-access/helpers/owner-scope-helpers.ts:73-116` `buildAccessibleCTE` — second copy
  - `src/common/authorization/services/owner-scope-resolver.service.ts:136-163` (in `getOwnerScopedIds`) — third copy of the walk
  - `src/common/authorization/services/owner-scope-resolver.service.ts:181-211` (in `isInOwnedScope`) — fourth copy, kept by plan
  - Plan adds a fifth copy via `walkUp` + `buildExistsSubquery` in phase-01-types-and-helper.md:73-99
  - `HIERARCHY_MAP` depth max = 4 hops per phase-01:214 risk-assessment row
- **Suggested fix:** Before Phase 1, extract `walkUp(tableName) → ChainHop[]` and `formatJoinChain(chain, aliasPrefix, suffix)` ONCE in `owner-scope-helpers.ts`. Make `buildOwnerJoinChain`, `isInOwnedScope`, and the new `applyDataScope` all consume the same primitive. Otherwise plan trades one anti-pattern for an N-copies-of-the-walker anti-pattern.

---

## Finding 5: `denies: number[]` field rides along despite zero evidence it earns its keep

- **Severity:** Medium
- **Location:** Phase 1, `DataScope` type definition (line 53-61) + Phase 3 interceptor `getOverrideOwnerDenies` (line 92-96)
- **Flaw:** The `DataScope` shape has 3 fields. Two have clear use (`explicit`, `ownedRoots`). The third, `denies`, is the `override_owner` kill-switch. Plan never quantifies how many records actually have an override_owner DENY in production — the field is materialized into the request object on EVERY decorated endpoint regardless. If override_owner DENY is rare (the brainstorm calls it "admin-controlled audit-lock"), 99% of requests carry an empty array that ends up no-op in the helper. The 3-field shape inflates type complexity, every test fixture must populate it (`{ explicit: [], ownedRoots: null, denies: [] }` repeated everywhere in phases 3/4/5/6), and helper logic has a special-case branch for `scope.denies.length > 0`.
- **Failure scenario:** Spec fixtures get verbose. Every test adds `denies: []`. The helper builds a 4th param `dsDeny_<suffix>` even when denies is empty (code path runs `if (scope.denies.length > 0)` — actually skipped, fine). But every test boilerplate gets the field. Cost: ~30 test fixture sites × 1 field each. Worse: plan does not flag whether `getOverrideOwnerDenies` SQL hits cache or DB on every request — if it's a DB query, the Promise.all in Phase 3 (line 92-96) does an unnecessary trip on the hot path for an empty result.
- **Evidence:**
  - phase-01-types-and-helper.md:59 (`denies: number[]` in interface)
  - phase-01-types-and-helper.md:141-145 (helper handles denies)
  - phase-03-interceptor-rewrite.md:95 (`this.permissionCache.getOverrideOwnerDenies(...)` — 3rd Promise.all)
  - `grep -n "getOverrideOwnerDenies" src/common/authorization/services/permission-cache.service.ts` → method exists at line 45 (cache-backed, OK) — but plan never verifies this
  - Brainstorm §4.2 "edge cases" lists "Denies: explicit + owned − denies" as ONE bullet — 1 of 9 — suggesting low-frequency feature
- **Suggested fix:** Either (a) quantify "how many records have override_owner DENY in prod" before treating it as first-class; or (b) keep current interceptor merge `merged.filter(id => !overrideOwnerDenies.includes(id))` and skip exposing `denies` to the helper — apply denies in interceptor where explicit IDs are already bounded. The `ownedRoots` branch with thousands of leaves can't currently be denied by the deny list (deny ID would need leaf expansion, which plan is REMOVING). So `denies` only ever filters the explicit branch — apply it there in the interceptor and shrink `DataScope` to 2 fields.

---

## Finding 6: Per-phase "Risk Assessment" tables are boilerplate; some risks pre-acknowledge known flakes

- **Severity:** Medium
- **Location:** Every phase file, section "Risk Assessment"
- **Flaw:** Every phase ships a Risk Assessment table even when the risk content is generic (e.g., phase-05:90-93 "1 controller bị miss → tsc bắt được" — that's just "tsc works"; phase-02:90-95 "Build vỡ ở interceptor → expected, Phase 3 sửa cùng PR" — that's just "dependency ordering"). Phase 1's risk table includes "Random suffix có thể collide ở test" with the proposed mitigation being "regex match instead of exact match" — i.e., the risk is being mitigated by accepting a known flake. Phase 6's risk table includes "Integration test seed DB lớn → flaky" mitigated by "Use isolated test DB" — generic test hygiene, not a real risk.
- **Failure scenario:** Reviewer fatigue. Real risks (Phase 6 trying to rewrite non-existent doc, Finding 1) get diluted in tables full of boilerplate. Plan author gets a false sense of "I've documented risks" because every phase has the table.
- **Evidence:**
  - phase-01-types-and-helper.md:208-215 (3 risks, 1 is a real flake admission)
  - phase-02-resolver-refactor.md:90-95 (2 risks, 1 generic, 1 = "Unresolved" duplicate)
  - phase-03-interceptor-rewrite.md:148-154 (2 risks, 1 generic)
  - phase-05-controllers-and-request-cleanup.md:88-93 (2 risks, both = "tsc works")
  - phase-06-integration-tests-and-docs-rewrite.md:128-134 (3 risks, all = generic test hygiene)
- **Suggested fix:** Drop Risk Assessment tables on Phases 2, 3, 5 (mechanical refactors with no novel risk). Keep on Phase 1 (helper design) and Phase 4 (semantic change in `deleteMany`/`findOne` behavior). For a 1–2 day refactor, 6 separate risk tables is checkbox theater.

---

## Finding 7: Phase 6 "SQL contains EXISTS" assertion tests implementation, not behavior

- **Severity:** Medium
- **Location:** Phase 6, "Functional / Integration test outline" lines 26 and 81-84 ("Emitted SQL contains EXISTS for owner branch (regression guard)")
- **Flaw:** Phase 6 adds an integration test that spies on TypeORM logger output and asserts the emitted SQL literally contains the substring `'EXISTS'`. This is implementation-coupled — if a future engineer rewrites `applyDataScope` to use `INNER JOIN` with `DISTINCT` and the BEHAVIOR is still correct (returns same record set), the test fails. Test should assert behavior (the right records come back) not the SQL keyword.
- **Failure scenario:** Senior engineer benchmarks and finds INNER JOIN with DISTINCT is 30% faster than EXISTS on Postgres 14 with their data distribution. They rewrite the helper. CI fails on the "EXISTS regression guard" test. They either (a) revert the perf improvement, (b) waste time appeasing the test, or (c) delete the test — at which point why was it ever there.
- **Evidence:**
  - phase-06-integration-tests-and-docs-rewrite.md:26 ("SQL plan check: verify SQL emitted có `EXISTS` cho owner branch (regression catch nếu helper revert sang IN-list)")
  - phase-06-integration-tests-and-docs-rewrite.md:81-84 (test code spies on `TypeORM logger or QueryBuilder emit`)
  - phase-06-integration-tests-and-docs-rewrite.md:121 (Success Criteria: "SQL regression guard ON")
  - Phase 1 already pins EXISTS via unit tests at phase-01:173 ("Test 5: owned 1-hop → EXISTS subquery") — duplicates the assertion at a level closer to the code
- **Suggested fix:** Delete the SQL-keyword assertion test. Phase 1 unit tests already lock the helper's emitted SQL. Integration tests should verify the records returned. If perf regression is a concern, gate on `EXPLAIN` plan in a separate (not unit-suite) bench harness — the plan correctly puts benchmarks "out of scope" (plan.md:60) so don't sneak one in via Phase 6.

---

## Finding 8: Indexes are "user responsibility" — splitting code and migrations across owners = incomplete delivery

- **Severity:** Critical
- **Location:** plan.md, sections "External dependencies (user responsibility)" (line 47-55) and "Out of Scope" (line 57-64); brainstorm §5 row 1 ("FK columns chưa có index → JOIN-up chậm trên bảng lớn")
- **Flaw:** Plan explicitly carves out FK partial indexes (4 tables listed at line 51-54) as "user responsibility outside scope". Brainstorm §5 RANKS this as the #1 risk at severity 🔴 High. The entire motivation for the refactor is performance (plan.md:21-27 "IN-list explosion", "PG plan switch sang seq scan"). EXISTS subqueries WITHOUT indexes on the FK columns will hit seq scan on the parent tables — likely WORSE than the current IN-list approach because the FK lookup must hit child rows. Plan ships code that requires indexes to perform; if indexes are not added at the same time, perf regresses.
- **Failure scenario:** Plan merges. Indexes are never added (because they're "user responsibility outside scope" and nothing tracks them). Production performance gets WORSE because EXISTS subquery without index on `ma_tool_documents.template_id` triggers seq scan on a 10k+ row table. Original problem ("IN-list at 10k+ records causes seq scan") is replaced with new problem ("EXISTS without FK index causes seq scan") — net negative impact on the exact metric this refactor was supposed to fix. This violates the rule: "if indexes are required for scale, they ARE in scope".
- **Evidence:**
  - plan.md:50-54 lists exact 4 indexes needed (`ma_tool_documents.template_id`, `ma_tool_templates.workspace_id`, `bi_hub_diagnostic_reports.bicc_department_id`, `bi_hub_reports.bicc_department_id`)
  - plan.md:55 ("Không có index → JOIN-up trong EXISTS subquery sẽ chậm với bảng lớn. Code đúng, scale phụ thuộc index.")
  - brainstorm-summary.md:305 (Risk #1, severity 🔴 High, mitigation: "User tự thêm migration index sau")
  - brainstorm-summary.md:335-345 includes the literal SQL DDL — author knows exactly what indexes are needed, but the plan still externalizes them
  - Codebase has no automated migration system surfacing — verified there's no `migrations/` folder generating these from the plan
- **Suggested fix:** Add Phase 7 "Migrations: FK partial indexes". 30 minutes. Migration is 4 `CREATE INDEX IF NOT EXISTS` statements already drafted in brainstorm §7. Without this, the plan is shipping a perf-motivated refactor that regresses perf.

---

## Finding 9: TDD ceremony on mechanical phases inflates effort with no defect-detection upside

- **Severity:** Medium
- **Location:** Phase 5, section "Implementation Steps" (lines 71-79) — "Update spec test fixtures (controller layer + e2e): replace `req.info.accessibleDataIds` mock với `req.info.dataScope`. Run controller specs → RED..."
- **Flaw:** Phase 5 is "replace 11 controller call sites" of literal pattern `req.info?.accessibleDataIds` → `req.info?.dataScope ?? null` (phase-05:35-41 diff shows it). This is a sed-tier mechanical change. Plan prescribes TDD: write failing tests first, then make them pass. The tests will fail because the SERVICE SIGNATURES already changed in Phase 4 — there's no novel test logic, just type-system propagation. TDD here is theater.
- **Failure scenario:** Engineer dutifully writes "test → RED → fix" cycle for 11 call sites that are all `find-replace`. Effort estimate 2h becomes 4h, half spent waiting for jest to run the same RED→GREEN cycle 11 times to "follow the plan". The actual safety net (tsc strict mode catching `accessibleDataIds` removal) is already mentioned at phase-05:92 — and is sufficient.
- **Evidence:**
  - phase-05-controllers-and-request-cleanup.md:71-79 (TDD steps for 11 mechanical edits)
  - phase-05-controllers-and-request-cleanup.md:92 ("Service signature `scope: DataScope \| null` không có optional default → tsc bắt được nếu undefined passed") — admits tsc is the actual safety net
  - All 11 call sites verified by grep, all are identical replacements
- **Suggested fix:** Phase 5: drop TDD ritual. Step 1 — replace 11 sites. Step 2 — tsc. Step 3 — run existing test suite. Done in 30 min not 2h. Reserve TDD for Phase 1 (real helper logic) and Phase 4 (semantic deleteMany change).

---

## Finding 10: 6 phases × 1 TODO list per phase × 1 success criteria per phase for what is a "split 1 field" refactor

- **Severity:** Medium
- **Location:** plan.md (overall structure) + all 6 phase files
- **Flaw:** The substantive change in this plan is: replace `accessibleDataIds: number[]` with `dataScope: DataScope | null` + write a helper that emits EXISTS instead of IN-list. That's two concepts. The plan packages this into 6 phases with effort estimates totaling 20h (4+2+3+6+2+3). Phases 2 and 3 could fold into one (resolver edit + interceptor edit are coupled changes — Phase 2 alone leaves a broken build per its own Risk Assessment line 93). Phases 5 and 6 docs work could fold into Phase 4. Phase 6 mostly cleans up after Phases 1–5 and rewrites a non-existent doc (Finding 1).
- **Failure scenario:** Plan looks thorough; reviewer approves. Implementer treats each phase as a checkpoint, commits 6 PRs (or 6 commits inside 1 PR). Each commit boundary risks intermediate broken state (Phase 2 admits build will break and Phase 3 fixes it). Plan author later cites "6 phases each with risk-assessment" as evidence of rigor; in fact each individual phase is too thin to assess independently. Total estimate (20h) is ~2x what 2 phases (helper + cutover) would need.
- **Evidence:**
  - plan.md:31-38 (6 phases listed)
  - phase-01-types-and-helper.md effort: 4h, phase-02: 2h, phase-03: 3h, phase-04: 6h, phase-05: 2h, phase-06: 3h
  - phase-02-resolver-refactor.md:93 ("Build vỡ ở interceptor + tests cũ tham chiếu `getOwnerScopedIds` — Expected — Phase 3 sửa interceptor cùng PR")
  - phase-03-interceptor-rewrite.md:151-152 (interceptor will fall back to "admin behavior" when services still read `accessibleDataIds` — i.e., silent permission BYPASS at the intermediate state, even more concerning than a broken build)
- **Suggested fix:** Consolidate to 3 phases:
  1. Helper + types + tests (current Phase 1)
  2. Cutover: resolver + interceptor + services + controllers + types (current Phases 2–5 — bundle for atomicity, avoid Phase 3's "silent admin fallback" interim state)
  3. Integration test (drop docs rewrite per Finding 1)

  Realistic estimate: 10h, not 20h.

---

## Finding 11: Phase 3 interim state silently bypasses permissions

- **Severity:** Critical
- **Location:** Phase 3, "Risk Assessment" line 151-152
- **Flaw:** Phase 3 plans to ship interceptor change BEFORE services migrate (Phase 4). Phase 3's own risk table admits: "Services trong Phase 4 vẫn còn đọc `accessibleDataIds` chưa migrate ... Interceptor không set nữa → các service đó tự nhiên thấy `undefined` → fail soft (admin behavior). Phase 4-5 migrate hết." — meaning the intermediate state lets unprivileged users see/edit ALL records because services interpret `accessibleDataIds === undefined` as "admin, no filter". This is a permission bypass between commit boundaries.
- **Failure scenario:** Phase 3 lands, CI runs all tests (passing because tests are updated for the new shape). Sometime before Phase 4 lands — pre-prod deploy, hotfix branch cherry-pick, partial merge — production runs Phase 3's interceptor against unmigrated Phase 4 services. Every authenticated non-admin user becomes effectively admin for data access on those endpoints. Auditors discover via access log. This is not a hypothetical — it's the explicit design admitted in the Risk Assessment cell.
- **Evidence:**
  - phase-03-interceptor-rewrite.md:151-152 (verbatim above)
  - phase-03-interceptor-rewrite.md:137 ("Modify `RequestWithInfo`: thêm `dataScope`, để tạm `accessibleDataIds` không xóa")
  - Service code today (bi-hub-diagnostic-report.service.ts:32,43,82,100,135,179 etc.) all treat `accessibleDataIds === undefined` as "no filter applied" → returns full list / allows operation
- **Suggested fix:** MERGE Phases 3 and 4 into one atomic phase (or ensure they ship in a single commit). Never land Phase 3 without Phase 4 in the same merge. Add an explicit "DO NOT MERGE Phase 3 separately" callout to plan.md and Phase 3.

---

## Summary

11 findings. Themes: (1) **Critical permission bypass** in inter-phase state (Phase 3 alone admits this); (2) **Critical scope-creep miss** on FK indexes ranked Risk #1 in brainstorm but punted to "user responsibility"; (3) **High flaw**: docs deliverable references a non-existent file; (4) **High flaw**: third+ copy of HIERARCHY_MAP walker; (5) lots of medium YAGNI ceremony around random suffixes, 3-field shapes, mechanical-edit TDD, boilerplate risk tables, and 6-phase packaging for a 2-concept refactor.

## Recommended Cuts (in priority order)

1. **Merge Phase 3 + Phase 4** to eliminate permission-bypass interim state (Finding 11) — CRITICAL.
2. **Add a Phase for FK indexes** OR cut the perf claim from the plan motivation (Finding 8) — CRITICAL.
3. **Drop docs rewrite from Phase 6** (file doesn't exist) (Finding 1) — HIGH.
4. **Extract single chain-walker helper** before adding 5th copy (Finding 4) — HIGH.
5. **Drop `Math.random()` suffix** (Finding 2), **inline `getOwnedRoots` filter** (Finding 3), **shrink DataScope to 2 fields** (Finding 5) — MEDIUM cleanup.
6. **Drop SQL-keyword regression test** (Finding 7), **drop TDD ritual on Phase 5** (Finding 9), **drop boilerplate Risk Assessments** (Finding 6) — MEDIUM noise removal.
7. **Reorganize as 3 phases not 6** (Finding 10) — MEDIUM.

## Unresolved Questions

- Brainstorm §3.2 says `isInOwnedScope` "giữ nguyên, đã đúng" — yet `isInOwnedScope` has the same walker code being replaced. Why is one walker an anti-pattern and the other "đúng"? Answer would inform Finding 4 dedup strategy.
- Plan.md "Unresolved" line 72 says admin matrix UI consumer is unverified. Without that verification, deleting `getOwnerScopedIds` (Phase 2) is unsafe. Should Phase 2 be blocked until user confirms?
- Is `getOverrideOwnerDenies` cache-backed or DB-hit? Phase 3's parallel `Promise.all` assumes all three cached. Plan never confirms.
