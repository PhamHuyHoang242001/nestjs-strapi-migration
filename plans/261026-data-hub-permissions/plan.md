---
title: Data Hub permissions (module codes + department-scoped data service)
description: >-
  Role-based create/update codes for consumer, logical, physical, data service;
  data service writes scoped by department membership; department config CRUD +
  members; FE flags.
status: completed
priority: P2
branch: main
tags:
  - data-hub
  - authorization
  - tdd
blockedBy: []
blocks: []
created: '2026-10-26T10:37:05.196Z'
createdBy: 'ck:plan'
source: skill
---

# Data Hub permissions (module codes + department-scoped data service)

## Overview
Source of decisions: [brainstorm report](../reports/brainstorm-261026-data-hub-permissions.md) (user-approved 2026-10-26).
- 13 codes (module "Data Hub"): consumer/logical/physical/data-service create+update, physical delete, department view/create/update/delete.
- Excel import: super_admin only.
- Data service create/update = role code ∧ member of department (`department_id`, "Đơn vị phát hành"); super_admin bypass.
- Department config: CRUD departments + add/remove members; members/candidates carry `can_create`/`can_update`.
- FE: `GET /v1/data-hub/my-permissions`, `GET /v1/data-hub/departments/writable?action=`, `is_update` on details.
- View/list/export/stats stay open to any logged-in user.

Mode: `--tdd` — every phase writes failing specs first, then code, then green.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Permission codes and access service](./phase-01-permission-codes-and-access-service.md) | Completed |
| 2 | [Department config and members](./phase-02-department-config-and-members.md) | Completed |
| 3 | [Guard write endpoints and is_update](./phase-03-guard-write-endpoints-and-is-update.md) | Completed |
| 4 | [FE permission wiring and config screen](./phase-04-fe-permission-wiring-and-config-screen.md) | Completed |
| 5 | [Verify with test users and docs](./phase-05-verify-with-test-users-and-docs.md) | Completed |

Order: 1 → 2 → 3 → 4 → 5 (2 and 3 both need 1; 3 needs the members table from 2; 4 needs 1-3).

## Key constraints
- No auto-format (`eslint --fix`/prettier); hand-fix lint. Select only needed columns; user refs `{id,email}`.
- User ids plain INT, no FK; multi-person link tables hard-delete, extend BaseLink.
- Never run `typeorm migration:run` (46 unrelated pending migrations); apply locally via temp `src/scripts-tests/zz-*.ts`, then delete.
- No plan/phase references in code comments or file names.

## Dependencies
- Builds on uncommitted Data Hub module (`plans/261023-data-hub-api`) and migration `2610221500-create-data-hub-tables.ts`.
- Reuses `src/common/authorization` (`PermissionGuard`, `@RequirePermission`, `PermissionCacheService`, `PermissionQueryService`).

## Red Team Review

### Session — 2026-10-26
**Findings:** 25 raw from 3 reviewers (security, assumptions, failure modes), deduplicated to 14 (12 accepted, 2 rejected).

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `POST /physical-terms/bulk` is an upsert: create-only users could overwrite existing rows | Critical | Accept: rows that overwrite existing columns also need `dh_physical_term_update` | Completed |
| 2 | Department delete races data-service / consumer writes and member adds | Critical | Accept: delete locks FOR UPDATE; writes and member adds lock the department FOR SHARE | Completed |
| 3 | Admin-client token ids collide with user ids, so an admin token would borrow a user's roles | High | Accept: Data Hub codes only for user-client callers; own `DataHubPermissionGuard` shares one rule with my-permissions | Completed |
| 4 | Fixed permission ids collide with other MAX+1 migrations | High | Accept: ids MAX+1 at runtime, matched by code, idempotent | Completed |
| 5 | Editing the applied create-tables migration is a no-op for the existing index | High | Accept: new migration `2610261100` (dup pre-check, drop and recreate ci index, members table, real down) | Completed |
| 6 | Department check order leaks NO_CHANGES / existence to non-members | Medium | Accept: lock → department check → validation | Phase 3 |
| 7 | Import 403 only after a 5MB upload | Medium | Accept: super-admin metadata checked by the guard before the interceptor | Phase 3 |
| 8 | Guard and FE flags disagree (owner-implied verbs, cache) | Medium | Accept: one access service for guard + flags; the module has no table_name (asserted in migration); cache staleness ≤300s documented | Phase 1, 2 |
| 9 | Unlisted future write routes ship open | Medium | Accept: reflection spec over every non-GET handler | Phase 3 |
| 10 | `member-candidates` route order | Medium | Accept: `/:id/member-candidates` sub-route | Phase 2 |
| 11 | Existing specs pass super_admin and hide the department path | Medium | Accept: specs default to a non-admin member | Phase 3 |
| 12 | Test-user seed copies unsafe pattern / DCR department does not exist | Medium | Accept: local-only, env password, insert-only; matrix uses C360 | Phase 5 |
| 13 | Logical writes change physical mapping without a physical code | Medium | Reject: user decided each form needs only its own code | — |
| 14 | Dev auth bypass when NODE_ENV=development | High | Reject (pre-existing, app-wide, out of scope); flagged to user | — |

### Whole-Plan Consistency Sweep
Phase files still describe the original design in places (fixed ids 119-131, `PermissionGuard`, migration edit). The implementation follows the table above; the API contract (`plans/261023-data-hub-api/api-contract.md` section P) is the up-to-date reference.
