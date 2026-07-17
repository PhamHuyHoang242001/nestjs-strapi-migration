---
status: completed
---
# Phase 2 — Cache wrapper + tests

## Context
- Plan: `../plan.md`
- Phase 1: `./phase-01-query-service-method.md`
- Target: `src/common/authorization/services/permission-cache.service.ts`, `src/common/authorization/constants/authorization.constant.ts`.

## Overview
- Priority: P2
- Status: Pending
- Add `getUsersByRecordPermission(tableName, recordId, code)` cache wrapper mirroring `getAccessibleRecords` cache pattern (permission-cache.service.ts:41-57). Read Redis → miss → query → write Redis.

## Key insights
- Cache key namespace NEW: `perm:record:${table}:${recordId}:${code}` — distinct from forward `perm:user:*:da:*` (different cardinality axis). Add `recordUsersCacheKey` builder + `RECORD_USERS_CACHE_TTL` const (reuse 120s = DATA_ACCESS_CACHE_TTL, or own const).
- Never throw on cache error — warn + fallback to query (mirror existing try/catch pattern).
- JSON serialize `{id,email}[]`.

## Requirements
- Functional: acceptance #10 (cache hit same shape, miss populates, Redis error → query fallback).
- Non-functional: idempotent, no double-query on hit.

## Architecture
```
getUsersByRecordPermission(table, recordId, code):
  key = recordUsersCacheKey(table, recordId, code)
  raw = RedisAdapter.get(key)  // try/catch warn
  if raw: return JSON.parse(raw)
  users = queryService.getUsersByRecordPermission(table, recordId, code)
  RedisAdapter.set(key, JSON.stringify(users), TTL)  // try/catch warn
  return users
```

Invalidation: extend `invalidateByTable(tableName)` to also clear `perm:record:${tableName}:*` (new namespace) — single additional `unlinkKeyByPattern` call. This covers data_access CRUD paths that already call `invalidateByTable`. Per-recordId precise invalidation NOT wired (TTL-bounded 120s) — document in code comment.

## Related code files
- Modify: `src/common/authorization/constants/authorization.constant.ts` (add `recordUsersCacheKey` + `RECORD_USERS_CACHE_TTL`).
- Modify: `src/common/authorization/services/permission-cache.service.ts` (add method + extend `invalidateByTable`).
- Modify: `src/common/authorization/__tests__/permission-cache.service.spec.ts`.

## Implementation steps
1. Add `recordUsersCacheKey(table, recordId, code)` + `RECORD_USERS_CACHE_TTL = 120` to constant file.
2. Add `getUsersByRecordPermission(table, recordId, code)` to cache service (mirror `getAccessibleRecords` body).
3. Extend `invalidateByTable` with `unlinkKeyByPattern(\`perm:record:${tableName}:*\`)` inside existing try/catch (Promise.all with existing call).
4. Tests: cache miss → query called + set called; cache hit → query NOT called; Redis get throws → query fallback (no throw); invalidateByTable clears new namespace.

## Todo list
- [ ] Add cache key builder + TTL const
- [ ] Add cache wrapper method
- [ ] Extend invalidateByTable
- [ ] Spec: miss populates cache
- [ ] Spec: hit skips query
- [ ] Spec: Redis error fallback
- [ ] Spec: invalidateByTable clears record namespace

## Success criteria
- Cache wrapper behaves per #10.
- No regression to `getAccessibleRecords` cache specs.
- `invalidateByTable` now clears both `perm:user:*:da:${table}*` and `perm:record:${table}:*`.

## Risk
- Forgetting to extend invalidation → stale reverse cache after data_access edit. Mitigated by TTL + explicit `invalidateByTable` extension + code comment.

## Next steps
- Phase 3: typecheck + full test run.
