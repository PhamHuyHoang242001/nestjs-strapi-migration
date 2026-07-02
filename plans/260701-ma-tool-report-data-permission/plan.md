---
title: "MA Tool Report data permission (explicit-only, parentless)"
description: "Expose ma_tool_cstb_rpt_properties via NestJS read API with explicit-only data_access scoping. No SO/resource_owners, no parent hierarchy."
status: completed
priority: P2
branch: "main"
tags: [permission, data-access, ma-tool, migration]
blockedBy: []
blocks: []
created: "2026-07-01T09:48:36.078Z"
createdBy: "ck:plan"
source: skill
---

# MA Tool Report data permission (explicit-only, parentless)

## Overview

Migrate the permission layer for `ma_tool_cstb_rpt_properties` to NestJS. Table has NO parent → declared as a standalone root in `HIERARCHY_MAP` but NOT registered in `ROOT_OWNER_CONFIG`, so the SO/`resource_owners` inheritance branch never activates and `DataScope` collapses to its `explicit` branch (`rec.id = ANY(:explicit)`). Reuses all existing data_access machinery (PermissionGuard, DataAccessInterceptor, `applyDataScope`, data_access assignment module).

Scope this round: **permission + read API only**. One verb: `view`. No data migration from Strapi. No create/edit/delete.

Design source: `./brainstorm-summary.md` (approved 2026-07-01).

TDD: each phase writes tests first, then implementation.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Registration & wiring](./phase-01-registration-wiring.md) | Completed |
| 2 | [Read API with data-scope](./phase-02-read-api-with-data-scope.md) | Completed |
| 3 | [Integration tests & verification](./phase-03-integration-tests-verification.md) | Completed |

## Implementation notes (cook 2026-07-01)

- Picker branch gated behind a new `EXPLICIT_ONLY_TABLES` set (hierarchy-config.ts) rather than the plan's literal "buildOwnerJoinChain === null" rule — that literal rule would have regressed `bi_payment_projects` (also a root absent from ROOT_OWNER_CONFIG) whose existing test asserts empty. The set is the correct discriminator: opt-in explicit-only tables get a candidate picker; owner-config-pending roots stay empty.
- `getScopedRecords`/unscoped path refactored: extracted shared `getUnscopedRecords` (byte-for-byte body move) so the picker reuses it.
- Migration `deleted_at` typed `timestamp without time zone` (matches BaseSoftDeleteEntity `@DeleteDateColumn`), not the plan's `timestamptz`.
- Service soft-delete filter uses `is_deleted IS NOT TRUE` (not `= false`) to match `getAccessibleRecords` convention and include nullable rows consistently (code-review Low #1).
- Verification: new specs green (config, picker, service 404/403, scope-composition A–F incl. super_admin default-deny). Full suite 406/407; the 1 failure is pre-existing env-dependent `transform-file-auth.guard.spec.ts` (unrelated). `npm run build` clean.
- Deploy runbook (Phase 3 step 5) still applies: run migration → seed rows 106/107/113 before traffic.

## Key decisions (locked, from brainstorm + red-team)

- Explicit data_access ONLY — no `resource_owners`, no `ROOT_OWNER_CONFIG` / `RESOURCE_TYPE_TO_ROOT_TABLE` entry.
- Scope unit = individual record (parentless). Ignore FK `data_service_center_id` this round.
- New root module "MA Tool" (`path='/ma-tool'`) → child "Report" (`path='/ma-tool/report'`). Paths pinned OUTSIDE any owner-scoped root path to avoid implied-verb contamination. One permission `ma_tool_report_view`.
- Display name column for data_access UI = `rpt_code` (nullable → `ID:<id>` fallback).
- `GET` returns full entity. `findOne`: 404 if missing, 403 if out of scope (kept per decision — enumeration trade-off accepted vs diagnostic parity).
- **super_admin is NOT special-cased** — it flows through `DataScope` like every user (verified: interceptor never nulls scope). super_admin without grants sees an empty list, matching diagnostic. True admin-all would be a separate future change.
- **Day-1 visibility = default-deny** — everyone (incl. super_admin) sees empty until grants assigned. Accepted; no default grant seeded.
- Free IDs: module 106 (MA Tool root), 107 (Report); permission 113 (`ma_tool_report_view`). Verified current max: module 105, permission 112.

## Reference (existing code to mirror / touch)

- Entity (exists): `src/modules/databases/ma-tool-cstb-rpt-property.entity.ts`
- Hierarchy config: `src/modules/data-access/constants/hierarchy-config.ts`
- Enum: `src/common/enums/data-access-table.enum.ts`
- Scope applier: `src/modules/data-access/helpers/data-scope-applier.ts`
- Seeders: `src/seeders/module.seeder.ts`, `src/seeders/permission.seeder.ts`
- Reference module: `src/modules/bi-hub-diagnostic-report/*` (controller/service/tests pattern)
- Guards/interceptor: `src/common/authorization/{guards,interceptors,decorators}`

## Dependencies

No cross-plan dependencies. Additive new module; low overlap with in-flight plans.

## Red Team Review

### Session — 2026-07-01
**Findings:** 13 (8 accepted, 5 surfaced to user as decisions)
**Severity breakdown:** 3 Critical, 3 High, 7 Medium
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| F1 | "super_admin sees all via scope=null" is false; interceptor never nulls scope | Critical | Accept (user: match diagnostic — super_admin needs grants) | Phase 2, 3, plan |
| F2 | Assignment record-picker returns empty for parentless table (`getScopedRecords`→`emptyResult`) | Critical | Accept — add explicit-only branch (new code) | Phase 1 |
| F3 | Physical `deleted_at`/`is_deleted` may be absent (Strapi table, synchronize:false prod) → 500 | Critical | Accept — add guarded migration; verify prod schema | Phase 1, 3 |
| F4/F13 | Prod rows land only via manual seed; no rollback | High | Accept — deploy runbook + verification + down() | Phase 3 |
| F5 | Day-1 default-deny regression vs Strapi audience | High | Surfaced → user: accept empty, assign later | plan, Phase 3 |
| F6 | Module `path` could contaminate implied-verbs | High | Accept — pin `/ma-tool*`, path-prefix test | Phase 1 |
| F7 | Explicit-only invariant wording wrong + under-tested | Medium | Accept — correct rationale, assert no resource_type maps | Phase 1 |
| F8 | `findOne` hand-rolled `explicit.includes` vs reuse | Medium | Accept — mirror `assertReportInScope` via `applyDataScope` | Phase 2 |
| F9 | Seeder rows omit path/name/is_active | Medium | Accept — full-shape rows | Phase 1 |
| F10 | 404/403 discloses record existence (enumeration) | Medium | Surfaced → user: keep split (diagnostic parity) | plan (documented) |
| F11 | Full-entity exposure, no response DTO | Medium | Surfaced → user: keep full entity | plan (documented) |
| F12 | `rpt_code` nullable → weak label | Medium | Accept — keep with ID fallback + data-profile check | Phase 1 |
| — | Phase 3 `PERM_ITEST` real-DB harness does not exist (no `.integration.spec.ts`, existing "integration" specs are DB-mocked) | (correctness) | Accept — use DB-mocked composition convention; real-DB harness flagged as optional/unbudgeted | Phase 3 |

### Whole-Plan Consistency Sweep
- super_admin model corrected consistently across plan.md / Phase 2 / Phase 3 (removed all "sees all via scope=null" claims and the super_admin-sees-all integration case).
- Explicit-only invariant rationale corrected (owner branch runs but no-ops; guard is absence from `RESOURCE_TYPE_TO_ROOT_TABLE`) in plan + Phase 1.
- Phase 3 harness reference corrected: no real-DB/`PERM_ITEST` harness exists; existing "integration" specs are DB-mocked composition. Phase 3 now targets that convention, with a real-DB harness flagged as an optional unbudgeted alternative.
- No stale references remain. Zero unresolved contradictions.

