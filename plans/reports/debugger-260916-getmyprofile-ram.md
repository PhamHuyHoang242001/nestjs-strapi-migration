# getMyProfile RAM — diagnostic

**Status:** DONE — split queries in `UsersService.getMyProfile` (2026-09-17)
**Endpoint:** `GET /v1/users/me` → `UsersService.getMyProfile`
**Verified:** `src/modules/users/users.service.ts:75-161`

## Executive summary

RAM spike khi user nhiều **data-access rule** (và nhiều role/permission) là **cartesian product TypeORM**, không phải leak. Một query `leftJoinAndSelect` hai cây `OneToMany` độc lập:

- `user_roles → role → role_permissions → permission`
- `user_data_access → permission + data_access`

Row count SQL ≈ `(role_permission rows) × (user_data_access rows)`. TypeORM hydrate full entity graph vào heap rồi mới flatten.

## Data flow

1. `BearerGuard` load user row (không load rules).
2. `getMyProfile` `getOne()` với 7 `leftJoinAndSelect`.
3. JS flatten + Map unique permissions.
4. `getUserImpliedVerbs` (cache Redis/memory) + optional `Permission.find(In(codes))`.
5. JSON serialize toàn bộ `Permission` entity.

Bottleneck: bước 2.

## Why RAM scales badly

| User | Roles | Perms/role | DA rules | SQL rows hydrated |
|------|-------|------------|----------|-------------------|
| light | 1 | 20 | 10 | ~200 |
| typical | 3 | 80 | 200 | ~48k |
| heavy (user report) | 5 | 200 | 5_000 | **~1_000_000** |
| worst | 10 | 300 | 20_000 | **~60_000_000** |

Mỗi row = User + UserRole + Role + RolePermission + Permission + UserDataAccess + Permission + DataAccess (full columns, gồm `users.password`, tokens). Node giữ:

- raw driver result
- TypeORM identity map / nested objects
- response JSON

Peak heap ≈ vài lần kích thước result set. 1M rows dễ OOM / GC pause.

## Secondary costs (nhỏ hơn cartesian)

1. **Không `select()`** — hydrate cả password, confirmation_token, reset_password_token, verify_code.
2. **Response `permissions: Permission[]`** — full entity, không `{id,code,method,action}`.
3. **`getUserImpliedVerbs`** — JOIN modules path LIKE; cache hit thì rẻ. Miss: DISTINCT codes, rồi `find({ code: In(...) })` nếu thiếu. Không cartesian nhưng thêm 1–2 query.
4. **Data-access join filter** chỉ `scope_type = ALLOW` + date; vẫn join **mọi** `user_data_access` rồi filter `da` — row UDA không match vẫn nhân cartesian với nhánh role.

## Not the cause

- `BearerGuard` / `IsUserGuard` — 1 user row.
- Permission guard — không gắn `/users/me`.
- Leak giữa request — graph GC sau response; peak **trong** request.

## Recommended fix (chưa implement)

Tách query, bỏ cartesian:

```ts
// 1. user + roles (select columns cần)
// 2. DISTINCT permission từ roles_permissions WHERE role_id IN (...)
// 3. DISTINCT permission từ data_access_users JOIN data_access (ALLOW + date)
// 4. merge Map + implied verbs như hiện tại
```

Hoặc 1 SQL `UNION` 2 nhánh permission, không join song song.

Expect: RAM ~ O(unique permissions + unique DA rows) thay vì O(P × DA).

Không trả full Permission entity; chỉ field FE cần.

## Verification plan (sau khi fix)

1. Seed user: 5 roles × 200 perm + 5k DA rules.
2. `GET /me` + `process.memoryUsage().heapUsed` before/after + `EXPLAIN` row count.
3. Before: row count ~ P×DA, heap spike lớn. After: rows ≈ unique perms + DA, heap gần linear.

## Unresolved

- Số rule thực tế production? (cần `COUNT` `data_access_users` cho user hot)
- FE cần full Permission hay chỉ `code`/`action`?
- Có cache profile theo user không (TTL + invalidate on role/DA change)?
