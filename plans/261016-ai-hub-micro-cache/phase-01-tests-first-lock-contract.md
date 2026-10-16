---
phase: 1
title: Tests first (lock contract)
status: completed
priority: P1
effort: 1.5h
dependencies: []
---

# Phase 1: Tests first (lock contract)

## Overview
Lock current behavior of the touched read paths, then write failing specs for the cache contract.

## Related Code Files
- Create: `src/common/micro-cache/__tests__/micro-cache.service.spec.ts`
- Modify: `src/modules/latest-artifacts/__tests__/latest-artifacts-stats.service.spec.ts`, `latest-artifacts.service.spec.ts`
- Modify: list specs in `src/modules/{skill-package,prompt-library,api-catalog}/__tests__/*query.service.spec.ts`

## Implementation Steps
1. Run current suites for the 3 query services + latest-artifacts; record baseline (all green).
2. `MicroCacheService` spec (use fake timers / injectable clock):
   - miss → loader called once, value returned; hit within TTL → loader not called again.
   - after TTL → loader called again.
   - 10 concurrent `getOrLoad` same key on miss → loader called **once**, all get same value.
   - loader rejects → all waiters reject; next call re-invokes loader (error not cached).
   - more than max keys → oldest evicted.
   - `clear()` empties cache.
3. List specs (each workspace): two `list({status: active,...})` calls → `getMany`/count queried once; `status=inactive` → queried each time; different page/search → different keys; key independent of property order.
4. Latest spec: two `listLatest(limit)` calls → DB once; different limit → separate key.
5. Stats spec: two different users → shared counts SQL once, per-user `my_versions` SQL per user; response shape `{data:[{type,total,pending,approved,rejected,published,my_versions}]}` unchanged, order skill/prompt/api-catalog/coworker.

## Success Criteria
- [ ] Baseline green recorded; new specs fail for the expected reason

## Risk Assessment
- Shared cache leaking between tests → each spec constructs its own `MicroCacheService` instance.
