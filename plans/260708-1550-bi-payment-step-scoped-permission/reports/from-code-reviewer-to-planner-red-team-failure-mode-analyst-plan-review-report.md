# Red Team Plan Review — Failure Mode Analyst

**Plan:** Bi-Payment Step-Scoped Permission (programId + workstep) — pilot list-doc
**Reviewer role:** Failure Mode Analyst (Murphy's Law)
**Verdict:** NOT land-ready. 3 Critical, 3 High, 2 Medium.

Trace performed: brainstorm pseudocode → phase-02 architecture → phase-03 controller/service rewrite → actual codebase (`bi-payment-document.service.ts`, `bi-payment-document.controller.ts`, `bi-payment-document.dto.ts`, `owner-scope-resolver.service.ts`, `permission-cache.service.ts`, `permission-query.service.ts`, `hierarchy-config.ts`, `owner-scope-helpers.ts`, `bi-payment-program.entity.ts`, `bi-payment-project.entity.ts`, `bi-payment-template.service.ts`, `workstep-type-perm.spec.ts`).

---

## Finding 1: `programUnderOwnedRoots` pseudocode queries a column that does not exist on `bi_payment_programs` — silent SO bypass failure
- **Severity:** Critical
- **Location:** Phase 1 "Architecture" item 4; Phase 2 "Architecture" pseudocode line `isOwner = await programRepo.biccDeptOf(programId) ∈ ownedRoots`; brainstorm `reports/brainstorm-summary.md` line 71
- **Flaw:** Pseudocode says "query program's `bicc_department_id`, check ∈ ownedRootIds". But `bi_payment_programs` has NO `bicc_department_id` column. Verified at `src/modules/databases/bi-payment-program.entity.ts:117-122`: program's only parent FK is `project_id` → `bi_payment_projects`. The `bicc_department_id` column lives on `bi_payment_projects` (`src/modules/databases/bi-payment-project.entity.ts:54`), one level up. Hierarchy is `program → project → bicc_department` (two hops), confirmed at `src/modules/data-access/constants/hierarchy-config.ts:19` and `:33`.
- **Failure scenario:** Cook follows pseudocode literally → query `SELECT bicc_department_id FROM bi_payment_programs WHERE id = $1` → Postgres throws `column "bicc_department_id" does not exist` at runtime. Tests are DB-mocked (per phase 2 "Mock vs real DB" risk note), so the mock will return whatever the spec author wrote — the bug ships to prod. First list-doc call by an SO owner → 500. Worse: if the cook "fixes" it by querying `project_id` only (one hop) and comparing to bicc-dept-owned root IDs, `isOwner` is always false → legitimate SO owner is demoted to per-code path → 403 on programs they own. The plan never recognizes that `OwnerScopeResolverService.isInOwnedScope(userId, 'bi_payment_programs', programId)` already performs this two-hop walk correctly (with soft-delete filters on every join — `owner-scope-resolver.service.ts:208-225`).
- **Evidence:**
  - Brainstorm line 71: `const isOwner = await this.programUnderOwnedRoots(programId, ownedRoots);` — no body, hand-waved.
  - `bi-payment-program.entity.ts:117-119`: only `project_id` column, no `bicc_department_id`.
  - `hierarchy-config.ts:19`: `bi_payment_programs: { parentTable: 'bi_payment_projects', fkColumn: 'project_id' }`.
  - `hierarchy-config.ts:33`: `bi_payment_projects: { parentTable: 'bi_hub_bicc_departments', fkColumn: 'bicc_department_id' }`.
  - `owner-scope-resolver.service.ts:185-231`: `isInOwnedScope` already walks the chain with `INNER JOIN ... AND deleted_at IS NULL` at every hop.
- **Suggested fix:** Drop `programUnderOwnedRoots` entirely. Use `ownerScope.isInOwnedScope(userId, 'bi_payment_programs', programId)` — it already returns the correct boolean with soft-delete filtering and is tested. If a separate "own-all fast path" is wanted, use `getOwnedRoots(userId, 'bi_hub_bicc_departments').length > 0 && isInOwnedScope(...)` — do NOT hand-roll the join.

---

## Finding 2: DTO field name collision — plan renames `workstep` → `workstepType` silently, breaking existing clients
- **Severity:** Critical
- **Location:** Phase 3 "Architecture" pseudocode line 28 (`workstepType = q.workstepType`) and "Implementation Steps" item 3 (`workstepType @IsOptional() @IsEnum(MaToolWorkstepType)`); brainstorm "Touchpoints" line 173 (`thêm optional workstepType: MaToolWorkstepType`)
- **Flaw:** The existing `SearchBiPaymentDocumentDto` already declares `workstep?: string` at `src/modules/bi-payment/document/dto/search-bi-payment-document.dto.ts:63-66` and the controller already uses it at `bi-payment-document.service.ts:52` (`if (query.workstep) qb.andWhere('t.workstep_type = :wt', { wt: query.workstep })`). The plan introduces a NEW field `workstepType` (different name) and never mentions the existing `workstep` field. Phase 3 pseudocode reads `query.workstepType` (camelCase) but never says whether to delete `workstep`, keep both, or rename. Existing Strapi clients send `?workstep=prepare`.
- **Failure scenario:**
  - If cook adds `workstepType` and leaves `workstep`: two filter sources. Existing clients sending `?workstep=prepare` hit neither the gate (which checks `workstepType`) nor the `IN` filter (which is in the `else if workstepType` branch). Client gets unfiltered `IN (all allowed)` list — possibly broader than intended — OR if `workstep` branch is kept, two filters apply (`workstep_type = prepare AND workstep_type IN (allowed)`) which is fine semantically but the gate is bypassed.
  - If cook renames `workstep` → `workstepType`: every existing Strapi-parity client sending `?workstep=prepare` now gets `workstepType=undefined` → gate skipped → user sees union of all their allowed worksteps instead of the single requested one. Information disclosure (user sees docs in worksteps they have perm for but didn't ask about).
- **Evidence:**
  - `search-bi-payment-document.dto.ts:63-66`: existing `workstep?: string` field.
  - `bi-payment-document.service.ts:52`: existing `if (query.workstep) qb.andWhere('t.workstep_type = :wt', ...)`.
  - Phase 3 pseudocode: `workstepType = q.workstepType (optional, @IsEnum(MaToolWorkstepType))` — never references `q.workstep`.
  - `bi-payment-document.controller.ts:27`: comment `GET /bi-payment/document?programId=X&workstep=prepare` confirms the public query contract.
- **Suggested fix:** Reuse the existing `workstep` field (don't introduce `workstepType`). Tighten its DTO from `@IsString` to `@IsEnum(MaToolWorkstepType)`. State explicitly in phase 3 that `programId` is the only DTO change and `workstep` semantics shift from "raw filter" to "gated filter". Add a backward-compat note for the stricter enum validation (clients sending invalid `workstep` values that previously silently no-op'd will now 400).

---

## Finding 3: Rollback hole — removing `@RequireDataAccess` on list handler, but `details`/`download`/`upload`/`delete`/`merge`/`updateStatus`/`stats` still depend on `req.info.dataScope`; `list()` rewrite drops `applyDataScope` entirely
- **Severity:** Critical
- **Location:** Phase 3 "Architecture" pseudocode (no `applyDataScope` in new `list()`) and Risk Assessment "DataScope path removed" line; plan.md "Key Decisions" line 49
- **Flaw:** Plan claims `@RequireDataAccess` is removed only on `list` handler and that's safe because "StepScopeService đã enforce per-program (chặt hơn)". But: (a) the existing `list()` calls `applyDataScope(qb, 'd', DOC_TABLE, scope)` at `bi-payment-document.service.ts:64` — this applies row-level deny rules (`scope_type = DENY`) to the document table itself. `StepScopeService.resolveAllowedWorksteps` only checks `getAccessibleRecords(userId, 'bi_payment_programs', code)` — i.e. whether the PROGRAM is accessible. It does NOT check whether a specific DOCUMENT is denied via `data_access` rules on `bi_payment_documents`. (b) The `DENY` branch in `permission-query.service.ts:124-127` subtracts denied `data_id`s — these are per-document denies that `getAccessibleRecords('bi_payment_programs', code)` cannot see.
- **Failure scenario:** Admin places a `DENY` rule on `bi_payment_documents` for document id=42 (sensitive recon file). Currently `applyDataScope` filters it out of list results. After plan ships: `list()` no longer calls `applyDataScope` → document 42 appears in the list for any user who has the matching workstep perm at the program. The deny rule is silently bypassed. `StepScopeService` operates at program granularity, not document granularity — it cannot honor per-document denies.
- **Evidence:**
  - `bi-payment-document.service.ts:64`: `applyDataScope(qb, 'd', DOC_TABLE, scope);` — current document-level row filter.
  - `permission-query.service.ts:81-122`: deny rules are per-`data_id` per-table — `getAccessibleRecords('bi_payment_programs', code)` returns program IDs, not document IDs, so deny rules on documents are invisible to StepScopeService.
  - Phase 3 pseudocode: `qb = docRepo.createQueryBuilder('d').leftJoin('d.template','t')` + `qb.andWhere('d.program_id = :pid')` + `if (workstepType) ... else ... IN allowed` — no `applyDataScope` call.
  - `permission-query.service.ts:124-127`: deny subtracts denied `data_id`s from the allowed set.
- **Suggested fix:** Either (a) keep `applyDataScope(qb, 'd', DOC_TABLE, scope)` in the new `list()` AND remove only the `assertProgramInScope` call (since `resolveAllowedWorksteps` replaces it), or (b) explicitly document that list-doc no longer honors per-document `DENY` rules and get sign-off from the permission owner. Option (a) is correct — StepScopeService handles program-level, `applyDataScope` handles document-level deny. Plan must state this explicitly and add a test for per-document deny surviving the rewrite.

---

## Finding 4: Cache invalidation gap — `RoleService.update-role` perm-change path invalidates `invalidateByRole` but NOT `invalidateOwnerScopeByRole`; SO owner-scope stays stale for 120s after role's `roles_permissions` change
- **Severity:** High
- **Location:** Phase 4 "Cache verify" (only verifies key existence, never verifies invalidation on write paths); brainstorm "Cache hit" success criterion line 165
- **Flaw:** Plan claims "Reuse 100% plumbing ... cache per-code, SO own-all" and phase 4 verifies cache hits but never traces the write-side invalidation. `RoleService.update()` at `src/modules/role/role.service.ts:468` calls `invalidateByRole(id)` (data-access + permission cache) but does NOT call `invalidateOwnerScopeByRole(id)` (owner-scope cache). Verified: only `saveOwnerAssignments` path (`role.service.ts:167`) calls `invalidateOwnerScopeByRole`. So: when admin updates a role's `roles_permissions` (grants `bp_program_preparing` to the role), the data-access cache for affected users is invalidated, BUT if those users' SO owner-scope cache had been populated before, it persists for 120s.
- **Failure scenario:** This specific bug is about the StepScopeService path. `resolveAllowedWorksteps` first checks `isOwner` via `getOwnedRoots` (cached 120s). If a user's SO ownership was just revoked (via `saveOwnerAssignments` change to `resource_owners`), `invalidateOwnerScopeByRole` IS called at `role.service.ts:167` — OK. But if a user's role loses a `bp_program_preparing` perm via `roles_permissions` update, `invalidateByRole` is called (clears `perm:user:*:da:*` + `perm:user:*:codes`) but `perm:user:{uid}:owner_scope` and `perm:user:{uid}:owner_verbs` survive. StepScopeService's `isOwner` check survives 120s → user still gets `allowed = all` → sees docs they should no longer see for up to 120s.
- **Evidence:**
  - `role.service.ts:468`: `if (hasPermChange) this.permissionCache.invalidateByRole(id).catch(() => {});` — no `invalidateOwnerScopeByRole`.
  - `role.service.ts:167`: only `saveOwnerAssignments` calls `invalidateOwnerScopeByRole`.
  - `permission-cache.service.ts:67-70`: `invalidateByRole` deletes `perm:user:*:da:*` but NOT `perm:user:*:owner_scope` (different key pattern).
  - `owner-scope-resolver.service.ts:124-127`: `getOwnedRoots` reads from `getUserOwnerScope` cached at key `perm:user:{uid}:owner_scope`.
- **Suggested fix:** Either (a) `RoleService.update()` perm-change path also calls `invalidateOwnerScopeByRole(id)` when perms change (correct — implied verbs depend on owned roots' module subtree, so any perm-tree change can affect implied verbs), or (b) plan acknowledges the 120s SO staleness window as acceptable and documents it. Do NOT ship silent.

---

## Finding 5: Partial failure / silent under-permission — `resolveAllowedWorksteps` sequential loop; if one `getAccessibleRecords` Redis call times out, exception propagates and user gets 403 instead of their actual permission
- **Severity:** High
- **Location:** Phase 2 "Architecture" pseudocode lines 4-5 (`for [ws, code] in WORKSTEP_TO_CODE: ids = await permCache.getAccessibleRecords(...)`); brainstorm pseudocode line 75-80
- **Flaw:** Loop awaits sequentially. `PermissionCacheService.getAccessibleRecords` at `permission-cache.service.ts:41-57`: on Redis READ failure, it logs warn and falls through to DB query (line 50) — good. But if the DB query (`queryService.getAccessibleRecords`) throws (connection timeout, deadlock, etc.), the exception propagates up through `resolveAllowedWorksteps` → `list()` → controller → NestJS default exception filter → 500. There is no try/catch around the loop. Compare to existing `BiPaymentTemplateService.resolveViewableWorksteps` at `bi-payment-template.service.ts:198-204` which calls `getPermissions(userId)` ONCE (single Redis/DB round-trip) instead of N times.
- **Failure scenario:** Redis is degraded. First `getAccessibleRecords` call succeeds (DB fallback), second throws (DB connection pool exhausted). `resolveAllowedWorksteps` throws → controller returns 500. User who legitimately has `bp_program_preparing` perm gets a 500 on list-doc. The existing template-list endpoint (which calls `getPermissions` once) would have succeeded.
- **Evidence:**
  - `permission-cache.service.ts:50`: `const ids = await this.queryService.getAccessibleRecords(...)` — no try/catch around DB call.
  - Phase 2 pseudocode: `for (const [wsType, code] of Object.entries(WORKSTEP_TO_CODE)) { ... await this.permCache.getAccessibleRecords(...) }` — no try/catch.
  - `bi-payment-template.service.ts:200`: `const perms = await this.permissionCache.getPermissions(userId);` — single call, returns Set of ALL codes.
  - `bi-payment-template.service.ts:201-203`: filters `WORKSTEP_TYPE_PERM` against the Set locally — no per-code DB round-trip.
- **Suggested fix:** Reuse the template service's pattern: call `permissionCache.getPermissions(userId)` ONCE, filter `WORKSTEP_TYPE_PERM` locally against the returned Set. This is what the existing template service does and it's strictly better (1 Redis call vs 3-4, no loop failure mode). The plan's `getAccessibleRecords(code)` approach is needed ONLY to get per-PROGRAM scoping — but `getPermissions` already tells you if the user has the code; combine with `isInOwnedScope` for the program check. If per-program data_access rules are required, keep the loop but wrap each call in try/catch returning `[]` on failure (fail-open within a code, not fail-closed for the whole endpoint) — but this trades correctness for availability, so prefer the `getPermissions` approach.

---

## Finding 6: Reinvents existing wheel — `BiPaymentTemplateService` already implements the same per-workstep pattern via `resolveViewableWorksteps` + `hasStepPerm`; plan duplicates without reconciling
- **Severity:** High
- **Location:** Phase 2 "Architecture" (entire `StepScopeService` design); brainstorm "Mở rộng" section line 130-134
- **Flaw:** `BiPaymentTemplateService` at `src/modules/bi-payment/template/bi-payment-template.service.ts:25-44` already implements: (a) `resolveViewableWorksteps(userId)` returning the set of workstep_types the user has perm for (lines 198-204), (b) `hasStepPerm(userId, code)` gating a specific workstep (lines 206-209), (c) `search()` with optional `workstepType` query that gates via `hasStepPerm` and falls back to `IN (:...viewable)` (lines 31-43). The plan introduces `StepScopeService.resolveAllowedWorksteps` + `assertWorkstep` with the SAME shape but operating at program granularity. The plan's "Related Code Files" in phase 2 does not list `bi-payment-template.service.ts` as a file to read or refactor.
- **Failure scenario:** Two divergent implementations of "workstep perm resolution" exist. Future maintainer updates `WORKSTEP_TYPE_PERM` mapping in one but not the other (the plan MOVES the map to `step-scope.service.ts` and re-exports — but `BiPaymentTemplateService` still imports from `bi-payment-document.service.ts` per `bi-payment-template.service.ts:4`). Bug ships. Also, the existing template service uses `getPermissions` (single call) while the new doc service uses `getAccessibleRecords` per code — two different cache strategies for the same logical operation.
- **Evidence:**
  - `bi-payment-template.service.ts:4`: `import { WORKSTEP_TYPE_PERM } from '@modules/bi-payment/document/bi-payment-document.service';` — 5 usages at lines 35, 49, 165, 201, 202.
  - `bi-payment-template.service.ts:31-43`: existing `search()` implements workstepType gate + union filter.
  - `bi-payment-template.service.ts:198-204`: existing `resolveViewableWorksteps`.
  - Phase 2 "Related Code Files": `Modify: bi-payment-document.service.ts (remove WORKSTEP_TYPE_PERM export → import từ step-scope; giữ re-export để backward compat nếu template service còn dùng)` — uses "nếu" (if) — never verified that template service DOES use it.
- **Suggested fix:** Either (a) move `WORKSTEP_TYPE_PERM` to `step-scope.service.ts` AND refactor `BiPaymentTemplateService` to use `StepScopeService` (DRY — single source of truth for workstep-perm resolution), or (b) explicitly scope the plan as "document-only, template service migration is a follow-up" and add `bi-payment-template.service.ts` to phase 1's "Read" list so the cook verifies the re-export actually works. Plan currently picks neither — it says "if template service uses it" (uncertainty) and moves on.

---

## Finding 7: `WORKSTEP_TYPE_PERM` move — existing test asserts import from `'../bi-payment-document.service'`; re-export must be a real `export` statement, not just re-import
- **Severity:** Medium
- **Location:** Phase 2 "Implementation Steps" item 5 (`Move WORKSTEP_TYPE_PERM vào service, re-export từ document.service.ts cho backward compat`); Phase 3 "Risk Assessment" line 78
- **Flaw:** Plan says re-export for backward compat. Existing test at `src/modules/bi-payment/document/__tests__/workstep-type-perm.spec.ts:2` imports `WORKSTEP_TYPE_PERM from '../bi-payment-document.service'`. If cook does `import { WORKSTEP_TYPE_PERM } from './step-scope.service'` in `bi-payment-document.service.ts` but forgets to add `export` to the re-import (i.e. writes `import` instead of `export ... from`), the symbol is no longer exported from `bi-payment-document.service.ts` → existing spec fails at import resolution (runtime `undefined`), TS compile may or may not catch depending on `isolatedModules`.
- **Failure scenario:** Cook writes `import { WORKSTEP_TYPE_PERM } from './step-scope.service';` (no `export`). TS compiles (import is valid). `workstep-type-perm.spec.ts` imports from `'../bi-payment-document.service'` — at runtime `WORKSTEP_TYPE_PERM` is `undefined` → `WORKSTEP_TYPE_PERM[MaToolWorkstepType.PREPARE]` throws `Cannot read properties of undefined`. Spec fails. But: if the cook's phase-3 spec (`bi-payment-document.service.step-scope.spec.ts`) imports from the new location, it passes — masking the broken re-export. Plan's phase 3 step 9 says "Chạy existing document spec ... verify không break. Nếu break vì WORKSTEP_TYPE_PERM move → fix import." — this catches it IF the cook runs the existing spec. But the plan phrases it as conditional.
- **Evidence:**
  - `workstep-type-perm.spec.ts:2`: `import { WORKSTEP_TYPE_PERM } from '../bi-payment-document.service';`
  - `workstep-type-perm.spec.ts:8`: `expect(WORKSTEP_TYPE_PERM[MaToolWorkstepType.PREPARE]).toBe('bp_program_preparing');` — asserts VALUE, not export location, so re-export works IF done correctly.
  - Phase 3 step 9: `Nếu break vì WORKSTEP_TYPE_PERM move → fix import.` — conditional language.
- **Suggested fix:** Make it mandatory, not conditional: "Phase 3 step 9 MUST run `workstep-type-perm.spec.ts` and it MUST pass without modification — the re-export at `bi-payment-document.service.ts` must be `export { WORKSTEP_TYPE_PERM } from './step-scope.service';` (not `import`). Add this as an explicit success criterion in phase 2."

---

## Finding 8: Deployment order — breaking `programId` required change; no sequencing plan for frontend/backend rollout
- **Severity:** Medium
- **Location:** Plan.md "Key Decisions" line 45 (`programId BẮT BUỘC trên list-doc (breaking: thiếu → 400)`); Phase 3 Risk Assessment "Backward-compat" line 77
- **Flaw:** Plan declares `programId` required (400 on missing) but the existing controller at `bi-payment-document.controller.ts:34` does `const programId = q.programId ? Number(q.programId) : undefined;` — currently optional. Existing DTO at `search-bi-payment-document.dto.ts:21` declares `programId?: string` (optional). If backend deploys first, any existing frontend/client not sending `programId` gets 400. If frontend deploys first and starts sending `programId`, backend still works (optional). Plan says "Mitigation: thông báo client; pilot internal" — no concrete rollout sequence, no feature flag, no deprecation period.
- **Failure scenario:** Backend ships. Existing Strapi-parity client (mobile app, integration partner) calls `GET /bi-payment/document?workstep=prepare` without `programId` → 400. Client breaks in prod. Plan's "pilot internal" mitigation assumes the only caller is internal — but the controller comment at `bi-payment-document.controller.ts:17` says "Strapi parity", implying external Strapi clients exist.
- **Evidence:**
  - `bi-payment-document.controller.ts:34`: `const programId = q.programId ? Number(q.programId) : undefined;` — currently tolerates missing.
  - `search-bi-payment-document.dto.ts:21`: `@IsOptional() readonly programId?: string;` — currently optional.
  - `bi-payment-document.controller.ts:17`: `// Strapi parity: /bi-payment/document (flat), programId via @Query.` — Strapi client contract.
  - Plan line 45: `programId BẮT BUỘC` (required).
  - Phase 3 risk note: `Mitigation: thông báo client; pilot internal.` — no concrete sequencing.
- **Suggested fix:** Either (a) phase the rollout: v1 makes `programId` optional but when omitted applies StepScopeService against ALL programs the user has any code at (no program filter, just workstep filter) — backward compatible; v2 (after client migration) makes it required. Or (b) add a feature flag / env var `BI_PAYMENT_STRICT_PROGRAM_ID` defaulting to false in prod, true in staging, flip after client migration. Or (c) document the exact deployment sequence: frontend deploys first (sends programId), backend deploys N days later. The plan currently has none of these.

---

## Summary

| # | Sev | Title |
|---|-----|-------|
| 1 | Critical | `programUnderOwnedRoots` queries non-existent column; reinvents existing `isInOwnedScope` |
| 2 | Critical | DTO `workstep` vs `workstepType` collision; silent client break |
| 3 | Critical | Removing `applyDataScope` on list silently bypasses per-document DENY rules |
| 4 | High | `RoleService.update` perm-change path doesn't invalidate owner-scope cache → 120s SO leak |
| 5 | High | Sequential `getAccessibleRecords` loop; one DB timeout = whole endpoint 500 |
| 6 | High | Duplicates existing `BiPaymentTemplateService` pattern without reconciliation |
| 7 | Medium | `WORKSTEP_TYPE_PERM` re-export: existing test must pass unconditionally, not "if breaks" |
| 8 | Medium | `programId` required is breaking; no rollout/deprecation sequence |

## Root cause

The plan was authored from the brainstorm summary without re-reading the actual codebase during planning. Evidence: phase 1 "Research" lists files to re-read but the plan's architecture (phase 2/3 pseudocode) is already locked and contains the bugs above — the research phase is decorative. Specifically, the plan missed:
- `bi-payment-template.service.ts` already implements the same pattern (Finding 6).
- `owner-scope-resolver.service.ts:isInOwnedScope` already does the hierarchy walk (Finding 1).
- `bi-payment-document.service.ts:64` `applyDataScope` handles per-document deny (Finding 3).
- `search-bi-payment-document.dto.ts:66` has `workstep` not `workstepType` (Finding 2).

## Recommended plan revisions before cook

1. Phase 1 must REQUIRE grepping for existing implementations of the same pattern (`resolveViewableWorksteps`, `isInOwnedScope`) and the plan must either reuse them or justify divergence.
2. Phase 2 pseudocode must use `ownerScope.isInOwnedScope(userId, 'bi_payment_programs', programId)` — delete `programUnderOwnedRoots`.
3. Phase 3 pseudocode must keep `applyDataScope(qb, 'd', DOC_TABLE, scope)` and must reuse `query.workstep` (not `workstepType`).
4. Phase 4 must add a test case for per-document DENY rule surviving the rewrite.
5. Phase 4 must add a test case for `RoleService.update` perm-change invalidating owner-scope cache (or plan must explicitly defer with documented 120s window).
6. Rollout: phase 3 must specify `programId` optional→required migration path (feature flag or phased).

**Status:** DONE_WITH_CONCERNS
**Summary:** 8 findings (3 Critical, 3 High, 2 Medium). Plan not land-ready. Core issues: pseudocode references non-existent column, DTO field collision, removing `applyDataScope` bypasses per-document DENY rules, duplicates existing template-service pattern, cache invalidation gap on role perm-change.
**Concerns/Blockers:** Plan was authored without re-reading codebase; phase 1 "Research" is decorative. Recommend planner revise phases 2-3 pseudocode against actual code before cook starts.
