---
phase: 2
title: Micro-cache service
status: completed
priority: P1
effort: 1h
dependencies:
  - 1
---

# Phase 2: Micro-cache service

## Overview
Small injectable in-memory cache with TTL, single-flight and size cap, exported globally.

## Architecture
```ts
@Injectable()
export class MicroCacheService {
  private readonly entries = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  constructor(private readonly maxEntries = 500, private readonly now = () => Date.now()) {}

  async getOrLoad<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.value as T;
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;
    const p = loader()
      .then((value) => { this.store(key, value, ttlMs); return value; })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
  clear() { this.entries.clear(); this.inflight.clear(); }
  // store(): delete+set to refresh insertion order; evict oldest (Map first key) while size > max
}
export function stableCacheKey(prefix: string, query: object): string // JSON with sorted keys, undefined dropped
export const AI_HUB_MICRO_CACHE_TTL_MS = 10_000;
```
Provider wiring: Nest can't inject primitive ctor args — use `useFactory: () => new MicroCacheService()` or default params with `@Optional()`; keep defaults simple.

## Related Code Files
- Create: `src/common/micro-cache/micro-cache.service.ts`, `micro-cache.module.ts` (`@Global()`, provides + exports), `index.ts`
- Modify: `src/app.module.ts` (import `MicroCacheModule`)

## Implementation Steps
1. Implement service + `stableCacheKey` per sketch.
2. Global module; register in `AppModule`.
3. Phase-1 micro-cache spec green; `tsc` clean.

## Success Criteria
- [ ] All `micro-cache.service.spec.ts` cases pass
- [ ] No Redis / network dependency

## Risk Assessment
- Unbounded keys → capped at 500; expired entries also dropped on read.
- Shared object mutation → documented in class comment; callers must not mutate returned values.
