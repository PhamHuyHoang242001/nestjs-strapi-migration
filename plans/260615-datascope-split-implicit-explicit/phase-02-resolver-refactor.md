---
phase: 2
title: "Resolver Refactor"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Resolver Refactor

## Overview

Delete `OwnerScopeResolverService.getOwnerScopedIds()` (the leaf-flattening hot path) và add lightweight `getOwnedRoots(userId, rootTable)` returning bounded root IDs from the existing cached `getUserOwnerScope`. Tests first.

## Requirements

### Functional

- `getOwnedRoots(userId: number, rootTable: string): Promise<number[]>` returns root IDs the user owns matching `rootTable`. Empty array if none.
- Implementation reuses `getUserOwnerScope` cache (do NOT re-query DB).
- `getOwnerScopedIds` is removed; build fails for any caller still referencing it (caught in Phase 3-4).

### Non-functional

- No SQL query touching `resource_owners` directly trong method này (chỉ filter từ cache).
- No new Redis cache key.

## Architecture

### Files

```
src/common/authorization/services/owner-scope-resolver.service.ts             [MODIFY]
src/common/authorization/services/__tests__/owner-scope-resolver.service.spec.ts  [MODIFY]
```

### Diff sketch

```typescript
// owner-scope-resolver.service.ts

// REMOVE method (lines 124-164):
async getOwnerScopedIds(userId: number, tableName: string): Promise<number[]> { ... }

// ADD method:
async getOwnedRoots(userId: number, rootTable: string): Promise<number[]> {
  const scope = await this.getUserOwnerScope(userId);
  return scope.filter((s) => s.rootTable === rootTable).map((s) => s.rootId);
}
```

### Public surface after Phase 2

| Method | Status | Notes |
|---|---|---|
| `getUserOwnerScope(userId)` | Unchanged | Cached, bounded by # owner roles. |
| `getUserImpliedVerbs(userId)` | Unchanged | For permission guard. |
| `getOwnedRoots(userId, rootTable)` | **NEW** | Returns root IDs for predicate-pushdown. |
| `isInOwnedScope(userId, tableName, recordId)` | Unchanged | Used by OwnerScopeGuard (LIMIT 1, fine). |
| `getOwnerScopedIds(userId, tableName)` | **DELETED** | Anti-pattern, replaced by `getOwnedRoots` + service-side helper. |
| `invalidate*` | Unchanged | |

## Related Code Files

### Modify
- `src/common/authorization/services/owner-scope-resolver.service.ts`
- `src/common/authorization/services/__tests__/owner-scope-resolver.service.spec.ts`

## Implementation Steps (TDD)

1. **Update spec first**:
   - Delete tests for `getOwnerScopedIds`.
   - Add tests for `getOwnedRoots`:
     - User with no owner scope → empty array.
     - User owns 2 workspaces → returns `[w1, w2]` for `rootTable = 'ma_tool_workspaces'`.
     - User owns 1 workspace + 1 bicc_department → `getOwnedRoots('ma_tool_workspaces')` returns workspace IDs only.
     - Cache hit verified: 2 calls → 1 DB query (`getUserOwnerScope` called once).
2. **Run** → RED (`getOwnerScopedIds` deleted, `getOwnedRoots` missing).
3. **Apply diff** trong service.
4. **Run** → GREEN.

## Success Criteria

- [x] `getOwnerScopedIds` no longer exists as a service method (grep `src/common/authorization/services/` empty). Caller references at `data-access.interceptor.ts:37` + `data-access-interceptor-with-owner.spec.ts` remain — expected, Phase 3 territory.
- [x] `getOwnedRoots` tests pass (5 new tests in spec, 25/25 total in file).
- [x] No DB query added; method reads from cache only via `getUserOwnerScope`.
- [x] No regression in `getUserImpliedVerbs` (5 unchanged tests still green).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Build vỡ ở interceptor + tests cũ tham chiếu `getOwnerScopedIds` | Expected — Phase 3 sửa interceptor cùng PR. |
| ~~Admin UI consumer~~ | **Resolved (Validation Q2):** BE scout cho thấy 0 endpoint expose output `getOwnerScopedIds` ra FE. Safe to delete. |
<!-- Updated: Validation Session 1 - Admin UI consumer resolved -->
