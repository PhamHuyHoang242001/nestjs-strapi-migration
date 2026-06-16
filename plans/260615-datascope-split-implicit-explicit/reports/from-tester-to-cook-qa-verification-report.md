---
from: tester
to: cook
date: 2026-06-15
plan: 260615-datascope-split-implicit-explicit
scope: full verification (correctness + scale)
verdict: PASS
---

# QA Report — DataScope Refactor (Implicit Owner-Roots + Explicit IDs)

## TL;DR

- TypeScript: clean (exit 0).
- Unit + integration tests: **32/33 suites pass, 277/281 tests pass**.
- 4 failing tests in `creator-access-grant.service.spec.ts` are **pre-existing on HEAD `7fcbc36`**, unrelated to this refactor.
- Scale targets verified end-to-end: no transitive-closure flattening, predicate-pushdown via `EXISTS` confirmed by regression-guard test and source inspection.
- One residual risk surfaced (FK partial indexes) — already flagged out-of-scope by plan; user responsibility.

## 1. Compile Check

| Command | Result |
|---------|--------|
| `npx tsc --noEmit -p tsconfig.build.json` | exit 0 — clean |

## 2. Test Execution

### 2.1 Authorization suite (refactor target)

```
src/common/authorization/**/*.spec.ts
Test Suites: 9 passed, 9 total
Tests:       85 passed, 85 total
```

Covered: `permission-cache`, `permission-query`, `permission-guard`, `permission-guard-with-owner`, `data-access-interceptor-with-owner`, `data-access-scope.helper`, `owner-scope-resolver.service`, `owner-scope-guard`, `so-owner-scope-integration`.

### 2.2 Modules touched by refactor

```
src/modules/{data-access, bi-hub-diagnostic-report, bicc-department}
Test Suites: 13 passed, 1 failed (creator-access-grant.service.spec)
Tests:       145 passed, 4 failed
```

### 2.3 Full suite

```
Test Suites: 32 passed, 1 failed, 33 total
Tests:       277 passed, 4 failed, 281 total
Time:        6.467 s
```

### 2.4 Failure analysis

File: `src/modules/data-access/__tests__/creator-access-grant.service.spec.ts`
Failures: 4 (`creates DataAccess + bulk-inserts UserDataAccess`, `bulk-inserts only 2 rows`, `bulk-inserts only 1 row`, `uses the provided EntityManager`).

Root cause: spec expects `manager.insert(Entity, [...rows])`; impl in `creator-access-grant.service.ts:71` uses `manager.save(rows)` (calls `create` + `save` twice — once for `DataAccess`, once for `UserDataAccess` rows).

Verified pre-existing on HEAD `7fcbc36` (ran `git stash → jest → git stash pop` → same 4 fails). File is NOT in `git status` modified list → NOT touched by plan 260615. Out of scope.

## 3. Scale Requirement Verification

Plan goal: **eliminate IN-list explosion + snapshot race + transitive-closure walk-down**.

| Check | Source | Verdict |
|-------|--------|---------|
| `req.info.accessibleDataIds` retired in prod code | `grep` finds 0 prod hits; 1 regression-guard test asserts `expect(info.accessibleDataIds).toBeUndefined()` (`data-access-interceptor-with-owner.spec.ts:189`) | PASS |
| Interceptor ships ROOT IDs only, not leaf IDs | `data-access.interceptor.ts:47` calls `ownerScope.getOwnedRoots(userId, rootTable)`; `owner-scope-resolver.service.ts:124-127` returns array bounded by user's owner-role assignments | PASS |
| Helper emits `EXISTS` subquery (no IN-list) | `data-scope-applier.ts:105 ('EXISTS (')`; SQL regression guard test confirms emitted SQL contains `EXISTS (` (`so-owner-scope-integration.spec.ts:216`) | PASS |
| Root-only path skips JOIN when target IS root | `data-scope-applier.ts:46-48`; regression test asserts no `EXISTS` and `ANY()` only (`so-owner-scope-integration.spec.ts:235`) | PASS |
| Owner scope cached in Redis (not per-query DB hit) | `owner-scope-resolver.service.ts:46-80` (`getUserOwnerScope`) reads Redis, single SQL fallback on miss, TTL applied | PASS |
| Write path: SQL-side scope filter, no JS `.filter()` | `bi-hub-diagnostic-report-write.service.ts:173-188` `deleteMany` runs `applyDataScope(qb, ...)` then `SELECT` → `UPDATE WHERE id IN (deletableIds)`. Snapshot race window closed (filter+select at T₁) | PASS |
| Param bind size bounded | Wire size = `O(|explicit| + |ownedRootIds| + |denies|)` — all 3 are user-scoped sets, NOT leaf-record counts | PASS |
| Helper resilient to HIERARCHY_MAP unknown table | `data-scope-applier.ts:53-55` drops owner branch; regression test covers `totally_unknown_table` fallback (`data-scope-applier.spec.ts:165-190`) | PASS |
| Cycle guard on hierarchy walk | `data-scope-applier.ts:92` (10-hop max, current depth 3) | PASS |

### Verified emitted SQL shape (from regression test 200)

```sql
... WHERE EXISTS (
  SELECT 1
  FROM "bi_hub_bicc_departments" __ds_t1_xxxxxxxx
  WHERE __ds_t1_xxxxxxxx.id = report."bicc_department_id"
    AND __ds_t1_xxxxxxxx.deleted_at IS NULL
    AND __ds_t1_xxxxxxxx.id = ANY($1)   -- $1 = owned root IDs (bounded)
)
```

PostgreSQL planner rewrites `EXISTS` → semi-join with FK index. Param bind is `O(|ownedRoots|)`, NOT `O(leaf records)`.

## 4. Residual Risks

### 4.1 FK partial indexes (out-of-scope per plan)

EXISTS subquery JOIN-up needs partial indexes on:
- `ma_tool_documents.template_id` (deleted_at IS NULL)
- `ma_tool_templates.workspace_id` (deleted_at IS NULL)
- `bi_hub_diagnostic_reports.bicc_department_id` (deleted_at IS NULL)
- `bi_hub_reports.bicc_department_id` (deleted_at IS NULL)

Plan `plan.md` line 65 marks indexes "user responsibility — out of scope". **Without these indexes, EXISTS still works but seq-scans on large tables; correctness intact, perf degrades.**

Recommendation: ship migration BEFORE this refactor reaches prod with > 10k records per root.

### 4.2 `creator-access-grant.service.spec.ts` failures

Not caused by this refactor. Recommend separate fix-pass — either align impl to use `manager.insert` (matches spec intent of bulk insert with single SQL roundtrip) or update spec to mirror current 2-`save` shape.

### 4.3 Helper random param-suffix (Math.random)

`data-scope-applier.ts:126-131` uses `Math.random().toString(36)` for param naming. Comment correctly notes "not a security boundary". Birthday collision on 8 base36 chars (~2.8e12 space) is negligible for typical request volume. Acceptable.

## 5. Test Coverage Summary (plan target tables)

| File | Tests | Status |
|------|-------|--------|
| `data-scope-applier.spec.ts` | 11 | all pass |
| `so-owner-scope-integration.spec.ts` | 10 | all pass |
| `data-access-interceptor-with-owner.spec.ts` | ~9 (incl. regression guard) | all pass |
| `owner-scope-resolver.service.spec.ts` | ~12 | all pass |
| `owner-scope-guard.spec.ts` | ~8 | all pass |
| `permission-guard-with-owner.spec.ts` | ~10 | all pass |
| `hierarchy-config-invariant.spec.ts` | ~4 | all pass |

## 6. Recommendation

**SHIP** the refactor. Scale targets met. Correctness verified via integration scenarios #2, #2b, #3, #3b, #6c, #8 + SQL shape regression guards.

Block prod rollout on FK partial-index migration. The plan flagged it; user owns it.

## Unresolved Questions

- Plan `Out of Scope` section lists `bi_payment_*` tables without owner config. Confirm consumers of `bi_payment_*` permissions don't go through `DataAccessInterceptor` yet, or accept that `dataScope = { explicit, ownedRoots: null }` falls back to explicit-only for these.
- `creator-access-grant.service` test/impl mismatch — is `manager.save(rows)` or `manager.insert(Entity, rows)` the intended shape? Affects bulk INSERT batching, not correctness.

**Status:** DONE
**Summary:** Plan 260615 refactor passes all targeted tests (85 authorization, 145 modules-touched). Scale verified — no IN-list explosion, predicate-pushdown EXISTS confirmed. Pre-existing 4 failures in creator-access-grant are unrelated.
**Concerns/Blockers:** FK partial indexes (user responsibility per plan) — must ship before scaling.
