---
phase: 2
title: "Read API with data-scope"
status: completed
priority: P1
effort: "3-4h"
dependencies: [1]
---

# Phase 2: Read API with data-scope

## Overview
Build the NestJS read module for `ma_tool_cstb_rpt_properties`: list + detail endpoints guarded by `ma_tool_report_view`, filtered by `DataScope` via the shared `applyDataScope` helper. Behavior mirrors the diagnostic user controller EXACTLY (no invented super_admin bypass).

## Requirements
- Functional:
  - `GET /ma-tool/report` → paginated list, scoped by `applyDataScope(qb, 'rpt', 'ma_tool_cstb_rpt_properties', scope)`.
  - `GET /ma-tool/report/:id` → full entity; 404 if record missing, 403 if out of scope (kept per decision; accepted enumeration trade-off documented in plan.md).
  - Returns full entity columns (per decision).
- Non-functional: guard/interceptor order identical to diagnostic user controller; NO new scoping logic (reuse `applyDataScope`).

## Architecture — CORRECTED super_admin model
**Verified reality:** `DataAccessInterceptor` ALWAYS sets `req.info.dataScope = { explicit, ownedRoots }` (`data-access.interceptor.ts:54-57`); it is never `null` on a live request. `PermissionGuard` only bypasses the *verb* gate for super_admin (`permission.guard.ts:28`), NOT data-scope. Test `data-access-interceptor-with-owner.spec.ts:50` confirms "super_admin → dataScope still resolved, no bypass". Therefore:
- **super_admin is treated like everyone else for data scope** (decision: match diagnostic). No `isSuperAdmin`-based scope bypass in `findAll`. A super_admin with no `data_access` grants sees an empty list — same as diagnostic's user list. `scope === null` only occurs when the interceptor is absent (admin/internal callers), and `applyDataScope` no-ops on null (`data-scope-applier.ts:24`).

Guard chain (mirror `bi-hub-diagnostic-report-user.controller.ts:19-20`):
`BearerGuard → IsMaintenanceGuard → PermissionGuard` + `@UseInterceptors(DataAccessInterceptor)`.

- Both routes: `@RequirePermission('ma_tool_report_view')` + `@RequireDataAccess(DATA_ACCESS_TABLE.MA_TOOL_CSTB_RPT_PROPERTIES, 'ma_tool_report_view')`.
- Controller passes `req.info?.dataScope ?? null`.
- `findAll(query, scope)`: build QB alias `rpt`, soft-delete filter (`rpt.deleted_at IS NULL AND rpt.is_deleted = false`), `applyDataScope(qb, 'rpt', 'ma_tool_cstb_rpt_properties', scope)`, pagination.
- `findOne(id, scope)`: fetch by id (soft-delete filter) → `NotFoundException` if missing → **reuse `applyDataScope`** for the in-scope check (mirror diagnostic `assertReportInScope`, `bi-hub-diagnostic-report.service.ts:246-252`): build a `SELECT 1` QB with the same predicate; if it returns nothing → `ForbiddenException`. Single predicate source for list + detail (no hand-rolled `explicit.includes`).

## Related Code Files
- Create: `src/modules/ma-tool-report/ma-tool-report.module.ts`
- Create: `src/modules/ma-tool-report/ma-tool-report.controller.ts`
- Create: `src/modules/ma-tool-report/ma-tool-report.service.ts`
- Create: `src/modules/ma-tool-report/dto/search-ma-tool-report.dto.ts` (mirror `SearchDiagnosticReportDto`)
- Create (test): `src/modules/ma-tool-report/ma-tool-report.service.spec.ts`
- Modify: `src/app.module.ts` (or aggregating module) — register `MaToolReportModule`

## Implementation Steps
1. **(Test first)** `ma-tool-report.service.spec.ts` with mocked repo/QB:
   - `findAll` scope `{explicit:[1,2], ownedRoots:null}` → predicate `rpt.id = ANY([1,2])`.
   - `findAll` scope `{explicit:[], ownedRoots:null}` → `1=0` (default-deny, incl. super_admin without grants).
   - `findAll` scope `null` (interceptor absent) → no scope predicate (admin/internal path).
   - `findOne` missing record → `NotFoundException`.
   - `findOne` present but out of scope → `ForbiddenException` (via `applyDataScope` `SELECT 1` empty).
   - `findOne` present + in scope → returns entity.
   - (NO "super_admin sees all" case — super_admin is scoped like everyone; covered by the empty-explicit case.)
   - Run → red.
2. Create DTO (page/limit/keyword over `rpt_code`/`rpt_owner`; mirror existing).
3. Implement service (`findAll`, `findOne`, shared `assertInScope` via `applyDataScope`).
4. Implement controller with decorators + guard chain.
5. Create module; register in app module.
6. Run service spec → green. `npm run build` clean.

## Success Criteria
- [x] Service spec passes (6 cases; NO super_admin-sees-all assumption)
- [x] Controller guard/interceptor order matches diagnostic user controller
- [x] `findOne` uses `applyDataScope` for the scope check (single source of truth)
- [x] `findOne` returns 404 (missing) / 403 (out of scope) per decision
- [x] Empty explicit → zero rows (default-deny), including super_admin without grants
- [x] tsc build clean

## Risk Assessment
- **super_admin visibility**: by decision, super_admin also needs `data_access` grants to see rows (matches diagnostic). If product later wants true admin-all, that is a SEPARATE change (new bypass or admin controller) — out of scope here.
- **List/detail divergence**: eliminated by reusing `applyDataScope` in both (F8).
- **Soft-delete filter**: depends on Phase 1 migration having added the physical columns; QB must filter them.
- **Enumeration via 404/403**: accepted trade-off (decision to keep diagnostic parity); documented in plan.md.
