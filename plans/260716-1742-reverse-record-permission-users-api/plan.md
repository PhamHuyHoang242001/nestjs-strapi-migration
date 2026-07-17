---
title: Reverse record-permission → users API
description: >-
  Add getUsersByRecordPermission(table, recordId, code): returns {id,email}[] of
  users who have permission `code` on record `recordId` of `table`.
  Explicit-only (role_data_access ∪ data_access_users), minus deny. Cache
  wrapper in PermissionCacheService. Generic — usable for any table/code (e.g.
  bp_program_confirm_release on bi_payment_programs:1).
status: completed
priority: P2
branch: main
tags:
  - permission
  - data-access
  - reverse-lookup
  - read-api
blockedBy: []
blocks: []
created: '2026-07-16T17:42:00.000Z'
createdBy: 'ck:cook'
source: skill
---

# Reverse record-permission → users API

## Overview
Permission stack hiện chỉ có hướng forward (user → records): `PermissionQueryService.getAccessibleRecords(userId, table, code)`. Thiếu hướng ngược (record + code → users): "ai có quyền `bp_program_confirm_release` trên program 1?". Thêm method generic `getUsersByRecordPermission(table, recordId, code)` trả `{id, email}[]`.

## Decisions (locked via /cook AskUserQuestion)
- **Output**: `{ id: number; email: string }[]`. Caller tự enrich thêm field nếu cần.
- **Scope**: explicit-only — `role_data_access` (qua `roles_permissions` + `user_roles`) ∪ `data_access_users` (user-exception, có `permission_id`). **Bỏ qua** SO owner kế thừa (bicc_department) và super_admin — caller tự xử lý nếu cần.
- **Location**: generic method trong `PermissionQueryService` (DRY, dùng cho mọi table/code) + cache wrapper trong `PermissionCacheService`.
- **Deny**: `(allow_role ∪ allow_user) \ (deny_role ∪ deny_user)`. Mirror forward `getAccessibleRecords` semantics (permission-query.service.ts:67-130).

## Architecture
Reverse lookup = đảo forward `queryDataIds` (permission-query.service.ts:141-206). Thay vì `SELECT da.data_id WHERE user/role = X`, query `SELECT DISTINCT user_id WHERE da.data_id = recordId AND code match AND allow`. UNION 2 nguồn (role-scoped, user-exception), subtract deny.

### Source 1 — Role-scoped (role_data_access)
```
data_access_roles dar
  JOIN data_access da ON da.id = dar.data_access_id
  JOIN modules m ON m.id = da.module_id AND m.table_name = $table
  JOIN <table> rec ON rec.id = da.data_id AND rec soft-delete guards
  JOIN roles_permissions rp ON rp.role_id = dar.role_id
  JOIN permission p ON p.id = rp.permission_id AND p.code = $code AND active
  JOIN user_roles ur ON ur.role_id = dar.role_id AND ur.deleted_at IS NULL
  JOIN role r ON r.id = dar.role_id AND r.status='active' AND r.deleted_at IS NULL
  JOIN users u ON u.id = ur.user_id AND u soft-delete guards
WHERE da.scope_type='allow' AND da soft-delete + date-window AND dar.deleted_at IS NULL
```

### Source 2 — User-exception (data_access_users)
```
data_access_users dau
  JOIN data_access da ON da.id = dau.data_access_id
  JOIN modules m ... table_name = $table
  JOIN <table> rec ON rec.id = da.data_id AND soft-delete guards
  JOIN permission p ON p.id = dau.permission_id AND p.code = $code AND active
  JOIN users u ON u.id = dau.user_id AND u soft-delete guards
WHERE da.scope_type='allow' AND dau.deleted_at IS NULL AND date-window
```

Deny = same 2 queries with `scope_type='deny'`. Final = `(allow1 ∪ allow2) \ (deny1 ∪ deny2)`.

### Implementation note — reuse queryDataIds? NO
`queryDataIds` hardcodes `SELECT da.data_id` + user/role owner condition (forward shape). Reverse needs `SELECT DISTINCT user_id` + `da.data_id = recordId` filter. Logic mirror nhưng shape khác → viết method riêng `queryUserIdsForRecord` (private helper, same guards: tableName regex validate, soft-delete, date-window, code filter allow/deny). Avoids contorting shared helper (KISS).

## Reused assets
- `SCOPE_TYPE` enum (`common/enums/mtpq.enums.ts`) — allow/deny.
- `STATUS.ACTIVE` (`common/enums/common.enum.ts`).
- tableName regex guard pattern (`permission-query.service.ts:147` — `/^[a-z_][a-z0-9_]*$/`).
- Soft-delete + date-window guards (mirror `queryDataIds:155-170`).
- `users` entity (`modules/databases/user.entity.ts`) — `email` column (line 72), `deleted_at`/`is_deleted` via BaseSoftDeleteEntity.
- Repos already injected in `PermissionQueryService`: `userRoleRepo`, `userDataAccessRepo`, `roleDataAccessRepo`.
- Cache pattern + `RedisAdapter` (`permission-cache.service.ts:19-57`) — read-then-write, warn-on-fail, never throw on cache error.
- Cache key builder convention (`authorization.constant.ts`).

## Phases
| Phase | Name | Status |
|-------|------|--------|
| 1 | [PermissionQueryService method + tests](./phase-01-query-service-method.md) | Completed |
| 2 | [Cache wrapper + tests](./phase-02-cache-wrapper.md) | Completed |
| 3 | [Typecheck + integration verify](./phase-03-typecheck-verify.md) | Completed |

## Acceptance criteria
1. `getUsersByRecordPermission('bi_payment_programs', 1, 'bp_program_confirm_release')` returns `{id,email}[]` of users with explicit allow on program 1 under that code.
2. User in role with allow rule for program 1 + code → included.
3. User with user-exception allow rule (data_access_users, permission_id = code's perm, scope allow, in date window) for program 1 → included.
4. User with matching deny rule → excluded even if also allow elsewhere (deny wins, mirror forward).
5. Out-of-date-window allow rule → excluded.
6. Soft-deleted user / role / data_access / target record → excluded.
7. Inactive role → its members excluded from role-scoped source.
8. Returns deduplicated (DISTINCT) — same user via both sources = 1 entry.
9. SO owner / super_admin NOT included (explicit-only, per decision).
10. Cache hit returns same shape; cache miss populates; Redis error → falls back to query (never throws).
11. tableName validated against identifier regex (injection defense-in-depth).

## Scope boundary (OUT of scope)
- No new API endpoint / controller. Method only — bi-payment (or any module) calls service directly.
- No SO owner inheritance, no super_admin inclusion.
- No pagination (return all matching users; expected small set per record).
- No write to data_access tables.
- No migration / schema change.

## Constraints
- Files <200 lines (modularization rule). `permission-query.service.ts` currently 206 lines — adding method risks ~280. **Mitigation**: extract new `queryUserIdsForRecord` + `getUsersByRecordPermission` into separate file `permission-query-record-users.service.ts` if base file exceeds ~230 lines after edit. Decide at implementation.
- Backward compat: pure addition — no change to existing `getAccessibleRecords`/`getUserPermissions`/`getUserIdsByRole` signatures.
- Tests DB-mocked composition specs asserting emitted SQL shape (convention [[perm-real-db-integration-test-convention]]).

## Touchpoints
- **Modify**: `src/common/authorization/services/permission-query.service.ts` (add method + private helper) OR new sibling service file (mod decision).
- **Modify**: `src/common/authorization/services/permission-cache.service.ts` (add cache wrapper method).
- **Modify**: `src/common/authorization/constants/authorization.constant.ts` (add `recordUsersCacheKey` builder + TTL const).
- **Modify**: `src/common/authorization/__tests__/permission-query.service.spec.ts` (add specs).
- **Modify**: `src/common/authorization/__tests__/permission-cache.service.spec.ts` (add cache specs).
- **Modify** (if modularize): `src/common/authorization/authorization.module.ts` (register new provider/exports if new file).
- **Stable contracts**: all existing exported method signatures, cache key formats for existing keys.

## Risk assessment
- **Cache staleness**: reverse cache keyed by `(table, recordId, code)`. Invalidation must cover it — extend `invalidateByTable` (already pattern-deletes `perm:user:*:da:${tableName}*` — need new key namespace `perm:record:${table}:*` cleared too) + add invalidation hook on data_access CRUD (data-access.service create/update/delete already invalidates by table/role). Gap: per-recordId precise invalidation not wired — acceptable (TTL-bounded, 120s). Document in code comment.
- **SQL injection**: tableName from caller (not user input in HTTP, but defense-in-depth) → regex guard (existing pattern). recordId/code parameterized.
- **Performance**: 4 queries (allow×2 + deny×2) parallel via Promise.all, mirroring `getAccessibleRecords`. Indexes exist on data_access(data_id), data_access_roles(role_id), data_access_users(user_id), roles_permissions(role_id, permission_id). Acceptable.
- **Modularization**: file-size risk noted above; mitigate by extraction.

## Security considerations
- Read-only query. No auth bypass — method returns data, caller still under its own guard.
- Does NOT grant anything; only reflects existing grants.
- Soft-deleted users excluded (no leakage).

## Next steps
- Phase 1: implement + test query method.
- Phase 2: cache wrapper + test.
- Phase 3: typecheck + verify no existing test regression.
