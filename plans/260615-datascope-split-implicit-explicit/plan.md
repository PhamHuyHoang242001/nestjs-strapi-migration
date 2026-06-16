---
title: 'Split DataScope: Implicit Owned-Roots vs Explicit Granted IDs'
description: >-
  Replace req.info.accessibleDataIds (flattened leaf ID list) with
  req.info.dataScope ({ explicit, ownedRoots, denies }) + service-side helper
  applyDataScope() that emits EXISTS subquery for owner-rooted predicate.
  Eliminates transitive closure materialization, IN-list explosion, and snapshot
  race window.
status: completed
priority: P1
branch: main
tags:
  - authorization
  - data-access
  - scope-owner
  - refactor
  - tdd
blockedBy: []
blocks: []
created: '2026-06-15T02:49:59.438Z'
createdBy: 'ck:plan'
source: skill
planDir: plans/260615-datascope-split-implicit-explicit
sourceDoc: brainstorm-summary.md
---

# Split DataScope: Implicit Owned-Roots vs Explicit Granted IDs

## Overview

Refactor SO (Scope Owner) read/write data-access flow. Hiện tại `DataAccessInterceptor` rải hết leaf record IDs (transitively owned via hierarchy walk-down) vào `req.info.accessibleDataIds: number[]`, service áp `WHERE id IN (...)`. Pattern này:

- **Perf**: bùng nổ IN-list khi owner workspace có 10k+ records → PG plan switch sang seq scan, wire/bind cost O(n).
- **Correctness**: snapshot leaf IDs tại T₀, query tại T₁ → race window khi tạo mới record.
- **Concept**: trộn 2 nguồn quyền (explicit grant + owner) → audit-log không trace được.

Thay bằng **predicate-pushdown**: interceptor chỉ ship root IDs user owns + helper `applyDataScope` emit `EXISTS` subquery cho owner branch + `= ANY(:explicit)` cho explicit branch.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Types and Helper](./phase-01-types-and-helper.md) | Completed |
| 2 | [Resolver Refactor](./phase-02-resolver-refactor.md) | Completed |
| 3 | [Interceptor Rewrite](./phase-03-interceptor-rewrite.md) | Completed |
| 4 | [Services Migration](./phase-04-services-migration.md) | Completed |
| 5 | [Controllers and Request Cleanup](./phase-05-controllers-and-request-cleanup.md) | Completed |
| 6 | [Integration Tests and Docs Rewrite](./phase-06-integration-tests-and-docs-rewrite.md) | Completed |

## Dependencies

### Cross-plan notes

- `plans/260518-generic-transform-file-common` (pending) — refactors `transform-file` to `src/common/`. Touch điểm chung: `src/common/transform-file/transform-file.types.ts`. **Decision (Validation Q3): Ship plan này TRƯỚC.** Plan transform-file rebase sau, pick up `dataScope` field. Phase 5 KHÔNG cần status check.
<!-- Updated: Validation Session 1 - cross-plan ship-this-first decision -->
- `plans/260611-1703-*` (shipped per memory `so-owner-implicit-permission-shipped`) — đây là plan đẻ ra bug. Plan này clean lại logic của nó.

### External dependencies (user responsibility)

User tự handle riêng (out of scope):
- Migration tạo partial indexes trên FK columns:
  - `ma_tool_documents.template_id`
  - `ma_tool_templates.workspace_id`
  - `bi_hub_diagnostic_reports.bicc_department_id`
  - `bi_hub_reports.bicc_department_id`
- **Không có index → JOIN-up trong EXISTS subquery sẽ chậm với bảng lớn.** Code đúng, scale phụ thuộc index.

## Out of Scope

- DB migrations (indexes)
- Audit-log expansion
- Benchmark suite
- Admin matrix UI (cần migrate riêng nếu còn consume `getOwnerScopedIds`)
- Owner config cho `bi_payment_*` tables
- PostgreSQL Row-Level Security adoption

## Source Brainstorm

`./brainstorm-summary.md` — full analysis, alternatives considered (A/B/C/D/E), rationale.

## Unresolved Questions

- **Write path edge case**: `bi-hub-diagnostic-report-write.service.ts:deleteMany` filter `ids.filter((r) => accessibleDataIds.includes(r.id))` JS-side. Pattern mới sẽ làm 1 SQL filter trước khi delete. Cần đảm bảo concurrency-safe (race giữa filter và delete) — verify trong Phase 4.

## Validation Log

### Session 1 — 2026-06-15

#### Verification Results
- **Tier:** Full (6 phases)
- **Claims checked:** 29
- **Verified:** 25 | **Failed:** 3 | **Adjusted:** 1
- **Source:** Explore scout pass on `nestjs-new/base-be-ts-sql/src/`

##### Verified facts
- `OwnerScopeResolverService` methods (`getOwnerScopedIds` lines 124-164, `getUserOwnerScope` lines 46-80, `isInOwnedScope` line 166) — exact match.
- `PermissionCacheService.getAccessibleRecords` line 49, `getOverrideOwnerDenies` line 45 — signatures match.
- `DataAccessInterceptor` 47 lines, calls `getOwnerScopedIds` line 37, sets `accessibleDataIds` line 42. Flow trace confirms explicit ∪ owner-scoped merge.
- `findRootTable` at `owner-scope-helpers.ts:7`, signature `(tableName: string): string | null`. 8 callers total.
- `HIERARCHY_MAP` at `hierarchy-config.ts:12`, shape `Record<string, { parentTable; fkColumn } | null>`. Root tables: `ma_tool_workspaces`, `bi_payment_projects`, `bi_hub_bicc_departments`.
- 51 `accessibleDataIds` usages across 11 files (baseline). Phase 5 target = 0.
- Controller endpoints: admin 4 (download/update/deleteMany/deleteOne), user 5 (findAll/findUpdatedUsers/findHistory/increaseView/findOne), bicc-department 2 (search/details). Match plan claim.
- `getOwnerScopedIds` callers BE-only: interceptor + 2 test files. No endpoint expose output to FE.

##### Failures (require plan correction)
1. **`src/common/authorization/types/` directory does not exist.** Plan Phase 1 creates `data-scope.types.ts` ở path này — sẽ phải tạo dir mới. Acceptable, no path change.
2. **`docs/so-permission-guide.html` does not exist.** Phase 6 references §4 §6 §7 §10 §11. → **Decision: cut docs portion (xem Q1).**
3. **No `database/migrations/` directory found.** Cannot verify FK partial indexes pre-exist. Plan already marks indexes "out of scope" — no impact.

##### Adjustments
- **HIERARCHY_MAP max depth = 3** (codebase, e.g. `bi_payment_other_files → bi_payment_checklists → bi_payment_programs → bi_payment_projects`), không phải 4 như Phase 1 risk row claim. Helper loop guard `max 10 hops` vẫn an toàn — chỉ là note documentation.

#### Decisions

**Q1: Phase 6 docs file missing → Cut docs rewrite.**
- **Why:** `docs/so-permission-guide.html` không tồn tại. Wait for user to clarify đúng location.
- **Effect:** Phase 6 chỉ còn integration test (6 cases). Effort 3h → 1.5h. Docs rewrite chuyển sang follow-up task ngoài plan này.

**Q2: Admin matrix UI consumer → Confirmed safe to delete `getOwnerScopedIds`.**
- **Why:** BE scout cho thấy 0 endpoint expose output `getOwnerScopedIds` ra FE. FE consumer (nếu có) chỉ thấy `accessibleDataIds` qua `req.info` indirectly — không gọi method trực tiếp. Phase 2 proceed.
- **Effect:** Drop unresolved question. Phase 2 risk row "Admin UI consumer" cleared.

**Q3: Cross-plan `260518-generic-transform-file-common` → Ship plan này trước.**
- **Why:** Scope hẹp hơn, không depend transform-file refactor. Plan kia rebase trên codebase mới với `dataScope` field.
- **Effect:** Phase 5 không cần status check transform-file plan trước impl. Cập nhật cross-plan note.

**Q4: Phase 6 SQL regression guard → TypeORM query logger spy.**
- **Why:** Stable, không phụ thuộc DB. Capture SQL string emitted, assert contains `EXISTS`. Catch revert helper sang IN-list pattern.
- **Effect:** Phase 6 test outline cập nhật rõ cơ chế. Add setup snippet trong test sketch.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-…`, `phase-02-…`, `phase-03-…`, `phase-04-…`, `phase-05-…`, `phase-06-…`.
- Decision deltas checked: 4 (docs cut, admin-UI resolved, cross-plan order, SQL regression mechanism).
- Reconciled stale references: 3 (Phase 6 docs section, Phase 2 risk row, plan.md cross-plan note).
- Unresolved contradictions: 0.
