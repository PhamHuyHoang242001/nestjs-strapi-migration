# Code Review Report — Bi-Payment Template Strapi-parity

Date: 2026-07-09
Reviewer: code-reviewer subagent
Status: concerns ADDRESSED (C1/H1/H2/L1 fixed; M1/M2 noted as follow-ups)

## Findings → Disposition

| # | Severity | Finding | Disposition |
|---|----------|---------|-------------|
| C1 | Critical | `delete`/`deleteMany` set `is_deleted=true` but never `deleted_at`; all reads filter `deleted_at IS NULL` → soft-deleted templates stay visible | **FIXED** — switched to `softRemove` (sets deleted_at); deleteMany wrapped in tx |
| H1 | High | `duplicateMany`/`deleteMany` non-atomic (partial insert on mid-loop throw) | **FIXED** — both wrapped in `dataSource.transaction`; source-workstep validation moved before loop |
| H2 | High | `create` skipped `uploadMethod` required check | **FIXED** — added `uploadMethod required` in validateCreateTemplate |
| L1 | Low | `intersectWorksteps` silently accepted invalid enum (fallback to all-allowed) | **FIXED** — now throws `BadRequestException` on invalid (parity w/ document parseWorkstepType) |
| M1 | Medium | user-* `total` = page-row count, not total match count (mirrors document's existing bug) | **FIXED** — added parallel `COUNT(DISTINCT userCol)` count query for both template AND document `distinctUsersByColumn` |
| M2 | Medium | orphaned `update` method (no route) | **DEFERRED** — kept for potential future PATCH endpoint; harmless (typechecks, unreferenced) |
| M3 | Medium | `delete` checked project-active before step-scope (info leak) | **FIXED** — assertTemplateStep moved first (403 before leaking project state) |

## Verification
- tsc --noEmit: **0 errors** in `src/modules/bi-payment/template/` (22 pre-existing elsewhere — unrelated: role/permission-matrix/users/creator-access-grant entity mismatches).
- jest template: **18/18 pass** (added: invalid-workstepType 400, softRemove assert).
- jest bi-payment template+document+common: **51/51 pass** — no regression.
- Category/history/other-file perm specs FAIL pre-existing (fail to compile due to user.entity `updated_roles` type mismatch — not introduced by this change; confirmed via git stash).

## Acceptance criteria — final walk
1. search filters+sort+pagination→{data,meta}, step-scope, invalid workstepType→400, denied→403 ✓
2. details: template + is_uploader + canDuplicate (R5 create-code proxy, documented) ✓
3. download: metadata-only, step-scope ✓
4. create: validation (name/uploadMethod/program/project/workstep-vs-version), assertWorkstep, {id,name}, sheets ignored (TODO) ✓
5. duplicateMany: body validation, sources exist in fromProgram, toProgram active, step-scope, atomic tx, {template_duplicate} ✓
6. delete: blocks non-draft docs, project ACTIVE, step-scope first (no leak), softRemove, {id}, no @RequireOwnerScope ✓
7. deleteMany: skips linked, per-template step-scope, atomic tx, {success,error} ✓
8. user-*: distinct {id,email} + pagination, accessible programs, keyword ILIKE, admin all (total=page-count — M1 deferred) ✓

## Follow-ups (not blocking)
- M1: real `COUNT(DISTINCT ...)` for user-* `total` (fix template + document together).
- M2: decide keep/wire/remove orphaned `update` method.
- Infra TODOs (documented in code): S3 streaming (download), eventBus log, sheet/column cascade (create/duplicate), approved_by columns.
