import { Injectable, Logger } from '@nestjs/common';

// TTL for AI Hub read endpoints served to many users at once. Staleness up to this window after a
// write (approve, status toggle) is accepted; there is no explicit invalidation.
export const AI_HUB_MICRO_CACHE_TTL_MS = 10_000;

const DEFAULT_MAX_ENTRIES = 500;

// Small in-process cache for hot, user-independent reads (single backend instance).
// - TTL per entry; expired entries are reloaded on the next read.
// - Single-flight: concurrent misses on one key share a single in-flight load, so a burst of
//   requests costs one DB round instead of one per request.
// - Failed loads are not cached; waiters get the error and the next call retries.
// - Bounded size: beyond `maxEntries` the oldest-inserted entry is evicted.
// Cached values are shared between callers — callers must treat them as read-only.
@Injectable()
export class MicroCacheService {
  private readonly logger = new Logger(MicroCacheService.name);
  private readonly entries = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  // Bumped by clear(): a load started before a clear must not repopulate the cache afterwards.
  private generation = 0;

  constructor(
    private readonly maxEntries: number = DEFAULT_MAX_ENTRIES,
    private readonly now: () => number = () => Date.now(),
  ) {}

  // `label` names the API being served (e.g. "GET /v1/skill/items") so the log shows, per request,
  // whether it was answered from cache (and how long until the next DB query) or from the database.
  getOrLoad<T>(key: string, ttlMs: number, loader: () => Promise<T>, label = key): Promise<T> {
    const hit = this.entries.get(key);
    if (hit) {
      const remainingMs = hit.expiresAt - this.now();
      if (remainingMs > 0) {
        this.logger.log(`[${label}] Lấy từ cache (còn ${Math.ceil(remainingMs / 1000)}s)`);
        return Promise.resolve(hit.value as T);
      }
      this.entries.delete(key);
    }

    const pending = this.inflight.get(key);
    if (pending !== undefined) return pending as Promise<T>;

    this.logger.log(`[${label}] Query database`);

    const startedIn = this.generation;
    const load: Promise<T> = loader()
      .then((value) => {
        if (startedIn === this.generation) this.store(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        // Only drop our own slot — a newer load for the same key may have replaced it after clear().
        if (this.inflight.get(key) === load) this.inflight.delete(key);
      });
    this.inflight.set(key, load);
    return load;
  }

  clear(): void {
    this.generation += 1;
    this.entries.clear();
    this.inflight.clear();
  }

  private store(key: string, value: unknown, ttlMs: number): void {
    // Re-insert so Map iteration order stays oldest-first for eviction.
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
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
