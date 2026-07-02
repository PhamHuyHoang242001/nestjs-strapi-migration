---
phase: 3
title: "Integration tests & verification"
status: completed
priority: P2
effort: "3-4h"
dependencies: [2]
---

# Phase 3: Integration tests & verification

## Overview
Prove explicit-only scoping via the repo's ACTUAL test convention, run the full suite + build, and confirm the deploy runbook.

**Reality check (verified 2026-07-01):** this repo has NO real-DB integration harness — there are no `.integration.spec.ts` files, no `PERM_ITEST` gate, and `so-owner-scope-integration.spec.ts` / `permission-then-interceptor-integration.spec.ts` are **DB-mocked composition specs** (jest-mocked repos/redis), not real Postgres. Do NOT claim to "reuse a real-DB harness" — it doesn't exist.

## Requirements
- Functional: role-based + user-exception grants resolve correctly through `getAccessibleRecords` → `DataScope.explicit` → predicate; SO/owner branch never fires for this table.
- Non-functional: follow the existing DB-mocked composition style (mirror `so-owner-scope-integration.spec.ts` / `permission-then-interceptor-integration.spec.ts`). SQL-shape assertions (e.g. emitted predicate contains `rpt.id = ANY(...)` and no `EXISTS`) as those specs do.

## Decision needed at cook time (flagged)
Two ways to prove the scope end-to-end; pick before writing:
- **(Default, KISS)** DB-mocked composition spec matching current repo convention — fast, no infra, verifies guard→interceptor→applier wiring + emitted predicate shape. Does NOT execute real SQL.
- **(Stronger, unbudgeted)** Build a real Postgres harness from scratch (`new DataSource`, `synchronize:true`, throwaway DB). Higher confidence but new infra the repo abandoned; only if the team wants real SQL execution guarantees.
Default to the mocked composition unless the reviewer/user asks for real-DB.

## Architecture (default: DB-mocked composition)
Mirror `permission-then-interceptor-integration.spec.ts`:
- Mock `getAccessibleRecords`/query service to return grant subsets; drive `PermissionGuard → DataAccessInterceptor → applyDataScope` for `ma_tool_cstb_rpt_properties`.
- Assert emitted predicate = explicit branch only (`rpt.id = ANY(:...)`), never `EXISTS (` (owner branch absent).
- Assert `DataScope.ownedRoots === null` for this table.
- Unit-cover `getAccessibleRecords` allow/deny/user-exception merge with a mocked repo (matches `permission-query.service.spec.ts` if present).

## Related Code Files
- Create (test): `src/modules/ma-tool-report/ma-tool-report-scope-integration.spec.ts` (DB-mocked composition, mirror `permission-then-interceptor-integration.spec.ts`)

## Implementation Steps
1. Write composition spec (DB-mocked, per repo convention):
   - **Case A** role grant: role(view) + `data_access_roles` on {1,2} → accessible = {1,2}; record 3 excluded.
   - **Case B** user exception allow: `data_access_users(view)` adds record 4 → accessible includes 4.
   - **Case C** deny subtracts: deny grant on record 2 → excluded.
   - **Case D** default-deny: view permission, zero grants → accessible = [] → list 0 rows. **Applies to super_admin too** (super_admin without grants = empty list, per corrected model).
   - **Case E** ownedRoots invariant: `DataScope.ownedRoots === null` for this table even when user owns other resources (no owner-scope leakage).
   - **Case F** soft-delete: granted-but-soft-deleted record never returned.
   - (Removed old "super_admin sees all" case — false per verified interceptor behavior.)
2. Run integration spec → green.
3. Run full unit suite (`npm test`) → green (config spec, picker spec, service spec, integration spec).
4. `npm run build` → clean.
5. **Deploy runbook (F4):** document + verify ordering —
   a. Run schema migration (Phase 1 soft-delete columns) on target DB FIRST.
   b. Land rows 106/107/113: run `npm run seed` (established pattern) OR the idempotent row migration. Confirm the deploy pipeline actually executes it — API must not receive traffic before rows exist or all non-admins get 403.
   c. Verify: `SELECT id FROM modules WHERE id IN (106,107)` and `SELECT id FROM permission WHERE id=113`; `\d ma_tool_cstb_rpt_properties` shows `deleted_at` + `is_deleted`.
   d. Rollback note: to pull the feature, delete rows 113 (+ dependent `role_permissions`/`data_access`), 107, 106; migration `down()` drops soft-delete columns.
6. **Day-1 expectation (decision):** default-deny — normal users AND super_admin see empty list until grants are assigned. Documented, accepted. No default grant seeded this round.
7. Update `docs/` permission inventory (permission-matrix / codebase-summary) if it tracks module+permission list — add MA Tool / Report / `ma_tool_report_view`.

## Success Criteria
- [x] Composition spec passes (cases A–F), predicate = explicit-only, no `EXISTS`
- [x] Full unit suite green
- [x] tsc build clean
- [x] Prod schema verified (columns present) via `\d` — mocked tests do NOT prove this
- [x] Deploy ordering + rollback documented; seed execution in pipeline confirmed
- [x] Docs updated if inventory exists

## Risk Assessment
- **Mocked tests do not execute real SQL** → predicate-shape assertions + Phase 1 `applyDataScope` unit spec cover the SQL text; real execution only if the team opts into a new harness (decision above).
- **Prod schema gap** → explicit prod `\d ma_tool_cstb_rpt_properties` verification step; never inferred from mocked/synchronized tests.
- **Seed not run on deploy** → runbook step 5b makes seed execution an explicit, verified gate before releasing traffic.
