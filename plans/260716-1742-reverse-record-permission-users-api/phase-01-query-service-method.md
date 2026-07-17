---
status: completed
---
# Phase 1 — PermissionQueryService method + tests

## Context
- Plan: `../plan.md`
- Target: `src/common/authorization/services/permission-query.service.ts` (or new sibling file if >230 lines after edit).

## Overview
- Priority: P2
- Status: Pending
- Add `getUsersByRecordPermission(tableName, recordId, code): Promise<{id:number; email:string}[]>` + private helper `queryUserIdsForRecord(repo, alias, tableName, recordId, scopeType, code)`.

## Key insights
- Mirror forward `queryDataIds` (permission-query.service.ts:141-206) guards: tableName regex, soft-delete on `rec`/`da`, date-window, code filter (role via EXISTS roles_permissions; user via join permission).
- Reverse shape: `SELECT DISTINCT u.id, u.email` + `da.data_id = :recordId` instead of `SELECT da.data_id` + user/role owner condition.
- Role source joins `user_roles` + `users`; user source joins `users` directly.
- Deny subtraction: run allow×2 + deny×2 in parallel, set-subtract by user id (deny wins).
- Email nullable on entity → return as string|null? Decision: filter null email OR include. **Decision**: include `{id, email: string|null}` — caller decides. (Spec acceptance #1 says `{id,email}[]`; keep email even if null for completeness.)

## Requirements
- Functional: acceptance criteria 1-9, 11 from plan.
- Non-functional: 4 parallel queries (Promise.all), parameterized, tableName regex-guarded.

## Architecture
```
getUsersByRecordPermission(table, recordId, code):
  [allowRole, allowUser, denyRole, denyUser] = Promise.all([
    queryUserIdsForRecord(roleDataAccessRepo, 'dar', table, recordId, ALLOW, code),
    queryUserIdsForRecord(userDataAccessRepo, 'dau', table, recordId, ALLOW, code),
    queryUserIdsForRecord(roleDataAccessRepo, 'dar', table, recordId, DENY, code),
    queryUserIdsForRecord(userDataAccessRepo, 'dau', table, recordId, DENY, code),
  ])
  allowed = Set(allowRole ∪ allowUser) keyed by id
  for u in denyRole ∪ denyUser: allowed.delete(u.id)
  return [...allowed.values()]
```

## Related code files
- Modify: `src/common/authorization/services/permission-query.service.ts`
- Maybe create (if >230 lines): `src/common/authorization/services/permission-query-record-users.service.ts` + register in `authorization.module.ts`.
- Modify: `src/common/authorization/__tests__/permission-query.service.spec.ts`

## Implementation steps
1. Read current `permission-query.service.ts` line count; decide modularize threshold (230 lines).
2. Add private `queryUserIdsForRecord(repo, alias, tableName, recordId, scopeType, code)`:
   - Regex-guard tableName (mirror `queryDataIds:147`).
   - Build queryBuilder: innerJoin `da`, `m` (module.table_name), `rec` (target table, soft-delete guards), for role alias join `user_roles ur`+`role r`+`users u`+EXISTS roles_permissions(code); for user alias join `permission p`(code)+`users u`.
   - `WHERE da.data_id = :recordId AND da.scope_type = :scopeType AND da soft-delete + date-window AND (alias).deleted_at IS NULL AND u soft-delete`.
   - Role: `r.status='active' AND r.deleted_at IS NULL AND ur.deleted_at IS NULL`.
   - `select DISTINCT u.id AS id, u.email AS email`.
3. Add public `getUsersByRecordPermission(tableName, recordId, code)` orchestrating 4 calls + set-subtract.
4. If base file >230: extract both methods to new service file, inject `roleDataAccessRepo`+`userDataAccessRepo`+`userRoleRepo` (or inject `PermissionQueryService` to reuse repos? NO — circular. New service gets own repo injections). Register provider+export in module.
5. Add tests (DB-mocked, assert SQL shape via queryBuilder mock chain like existing specs).

## Todo list
- [ ] Decide modularize (read file size)
- [ ] Implement `queryUserIdsForRecord` private helper
- [ ] Implement `getUsersByRecordPermission` public method
- [ ] Add spec: role allow included
- [ ] Add spec: user-exception allow included
- [ ] Add spec: deny excludes (deny wins)
- [ ] Add spec: date-window excludes expired
- [ ] Add spec: soft-deleted user/role/da/record excluded
- [ ] Add spec: inactive role members excluded
- [ ] Add spec: dedup (same user 2 sources = 1 entry)
- [ ] Add spec: tableName regex rejects invalid

## Success criteria
- Method returns correct `{id,email}[]` per all acceptance criteria.
- All new specs pass; existing specs unchanged/pass.
- `npx tsc --noEmit` clean (run in phase 3).
- File(s) <200 lines (modularize if needed).

## Risk
- queryBuilder mock chain for new join shape — mirror existing `mockQueryBuilder` helper (extend if needed for new `leftJoin`/`select` combos).
- EXISTS subquery for role code filter — test must assert it's emitted.

## Next steps
- Phase 2: cache wrapper.
