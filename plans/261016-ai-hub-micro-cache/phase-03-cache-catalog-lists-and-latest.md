---
phase: 3
title: Cache catalog lists and latest
status: completed
priority: P1
effort: 1.5h
dependencies:
  - 2
---

# Phase 3: Cache catalog lists and latest

## Overview
Wrap the user-independent branch of `list()` in skill / prompt / api-catalog and `listLatest()` with the micro-cache.

## Related Code Files
- Modify: `src/modules/skill-package/skill-package-query.service.ts` (`list`, ~L158)
- Modify: `src/modules/prompt-library/prompt-library-query.service.ts` (`list`)
- Modify: `src/modules/api-catalog/api-catalog-query.service.ts` (`list`)
- Modify: `src/modules/latest-artifacts/latest-artifacts.service.ts` (`listLatest`)
- Constructors: inject `MicroCacheService` (`@Optional()` keeps existing spec constructors working; when absent → no caching)

## Implementation Steps
1. In each `list(query, userId)`: after `listMode` is computed, if `listMode === 'active'` → `return this.microCache.getOrLoad(stableCacheKey('<ws>:list', query), AI_HUB_MICRO_CACHE_TTL_MS, () => this.loadList(query, listMode, []))`; otherwise current path. Extract existing body into a private loader with minimal movement (no reformatting of untouched lines).
   - Verify the `active` result carries no per-user field (only `viewerId` for own-inactive) — confirmed by scout for all 3.
   - `isSo` lookup stays before the branch (Redis-cached owner scope) — needed to compute `listMode`.
2. `listLatest(limitOverride)`: key `latest:{resolvedLimit}`.
3. Phase-1 list + latest specs green; existing specs unchanged.

## Success Criteria
- [ ] Active list served from cache within 10s; inactive list always fresh
- [ ] Response shape identical to before

## Risk Assessment
- Query DTO containing class instances / dates → `stableCacheKey` serializes via JSON; page/limit defaults applied before keying so `{}` and `{page:1}` share a key.
