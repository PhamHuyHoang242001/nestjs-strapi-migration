import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';

// TTL for AI Hub read endpoints served to many users at once. Staleness up to this window after a
// write (approve, status toggle) is accepted; there is no explicit invalidation.
export const AI_HUB_MICRO_CACHE_TTL_MS = 10_000;

// Upper bound on cached keys (LRU) for the in-memory store; key count grows with page/search/filter.
export const MICRO_CACHE_MAX_ENTRIES = 500;

// Thin wrapper over the Nest cache-manager (`CACHE_MANAGER`) for hot, user-independent reads.
// - `cache.wrap` gives TTL + single-flight: concurrent misses on one key share one load, so a burst
//   of requests costs one DB round. Failed loads are not cached.
// - The store is configured in MicroCacheModule (in-memory LRU today); moving to Redis for several
//   instances only changes that store, not the callers.
// Cached values are shared between callers — callers must treat them as read-only.
@Injectable()
export class MicroCacheService {
  private readonly logger = new Logger(MicroCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  // `label` names the API being served (e.g. "GET /v1/skill/items") so the log shows, per request,
  // whether it was answered from the database or from cache (and how long until the next DB query).
  async getOrLoad<T>(key: string, ttlMs: number, loader: () => Promise<T>, label = key): Promise<T> {
    let loaded = false;
    const { value, expires } = await this.cache.wrap(
      key,
      () => {
        loaded = true;
        this.logger.log(`[${label}] Query database`);
        return loader();
      },
      { ttl: ttlMs, raw: true },
    );
    if (!loaded) {
      const remainingSeconds = Math.max(0, Math.ceil(((expires ?? Date.now()) - Date.now()) / 1000));
      this.logger.log(`[${label}] Lấy từ cache (còn ${remainingSeconds}s)`);
    }
    return value;
  }

  async clear(): Promise<void> {
    await this.cache.clear();
  }
}

// Deterministic key for a query object: keys sorted, undefined values dropped, so
// `{ page: 1, limit: 20 }` and `{ limit: 20, page: 1 }` share an entry.
export function stableCacheKey(prefix: string, query: object): string {
  const entries = Object.entries(query)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `${prefix}:${JSON.stringify(entries)}`;
}
