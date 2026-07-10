# Bi-Payment Document Handler Inventory (Phase 3, Finding 7)

Pilot wired ONLY `list()`. All other document handlers remain **verb-gate-only** (`@RequirePermission` + `@RequireDataAccess(TABLE[, code])`). They are **out of scope** for this pilot — deferred to a follow-up plan.

`@RequireDataAccess(TABLE)` (no code arg) fetches `getAccessibleRecords(userId, table, undefined)` — the permissionCode filter is SKIPPED (`permission-query.service.ts:181`), so row-level allow leaks across worksteps. Handlers with an explicit code arg (`stats`, `upload-status`, `merge-file`, etc.) are correctly code-scoped at the data-scope layer but still NOT per-program-step gated (no StepScopeService).

## Deferred handlers (13)

| # | route | method | codes | @RequireDataAccess | step-scope? |
|---|-------|--------|-------|---------------------|-------------|
| 1 | `GET /:id` | details | 5 codes | TABLE (no code) | NO — verb-gate-only |
| 2 | `GET /:id/download` | download | 5 codes | TABLE (no code) | NO |
| 3 | `POST /` | upload | 5 codes | TABLE (no code) | NO |
| 4 | `DELETE /:id` | delete | 3 codes | TABLE (no code) | NO |
| 5 | `PATCH /update-status` | updateStatus | 2 codes | TABLE (no code) | NO |
| 6 | `POST /merge-file` | merge | confirm_release | TABLE + code | NO (data-scope code-scoped) |
| 7 | `GET /get-merged-status-reconcilation/:id` | getMergeStatus | confirm_release | TABLE + code | NO |
| 8 | `GET /download-merged-reconcilation/:id` | downloadMerged | confirm_release | TABLE + code | NO |
| 9 | `GET /stats` | stats | view | TABLE + code | NO |
| 10 | `GET /upload-status` | uploadStatus | view | TABLE + code | NO |
| 11 | `GET /user-created` | userCreated | view | TABLE + code | NO |
| 12 | `GET /user-updated` | userUpdated | view | TABLE + code | NO |
| 13 | `GET /user-approved` / `user-rejected` | userApproved/Rejected | view | TABLE + code | NO |

## Cross-workstep leak risk (handlers 1-5)

Handlers 1-5 use `@RequireDataAccess(TABLE)` with NO code → `getAccessibleRecords(table, undefined)` returns allow-grants across ALL codes. A user holding code X at program A but calling download on a doc whose `program_id` is A but whose template `workstep_type` maps to code Y → still downloads (verb gate passes via code X held globally; row-filter doesn't distinguish workstep). This is the SAME class of bug the pilot fixes for `list()` — it remains open for these 5 handlers.

**Mitigation:** follow-up plan should wire StepScopeService.assertWorkstep (or assertCodeAtProgram) on `doc.program_id` for read/write paths, mirroring the list-doc fix.

## Provisioning (Finding 4)

`data_access.data_id` is polymorphic via `module_id`. For a rule to scope a code to a program, a `data_access` row with `data_id = programId` AND `module_id = module(bi_payment_programs)` must exist, plus a `data_access_users` (user-exception) or `role_data_access` (role) link carrying the `permission_id`.

- Seeder (`src/seeders/data-access.seeder.ts`) seeds module_id 3/4/7 only — NO program-scoped rules seeded for module_id 13 (bi_payment_programs).
- Admin endpoint: `data-access` module exists (`src/modules/data-access/`) with CRUD for rules. An admin can create a rule with `data_id=programId`, `module_id=13`, scope_type=ALLOW, + link to role/user with permission_id. So the path EXISTS operationally.
- Without such rules, non-SO users with only role-level step codes will get **403** on list-doc (StepScopeService throws when `getAccessibleRecords` returns empty for the program). This is **correct enforcement** — the user genuinely has no program-scoped grant.

**Decision:** no seed data added in pilot. Admins must provision program-scoped rules before non-SO users use list-doc. SO owners work immediately (no rule needed).

## Cache (Finding 11)

`RoleService.update` perm-change path calls `invalidateByRole(roleId)` (clears `perm:user:*:da:*` + `:codes`) but NOT `invalidateOwnerScopeByRole` (clears `:owner_scope` + `:owner_verbs`). So if a role loses a step code via `roles_permissions` edit, the data-access cache clears but the owner-scope cache survives up to 120s. For a pure SO user this is immaterial (own-all is deny-immune by design). For a user whose step access depends on `getAccessibleRecords` (the role-branch allow), the `da:` cache IS cleared → correct. **Accepted risk:** 120s window only affects the `isInOwnedScope` SO check, which is deny-immune. Follow-up: add `invalidateOwnerScopeByRole` to `RoleService.update` for completeness.
