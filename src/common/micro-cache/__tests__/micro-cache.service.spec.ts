import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createInMemoryMicroCache, MicroCacheModule } from '../micro-cache.module';
import { MicroCacheService, stableCacheKey } from '../micro-cache.service';

// Deferred promise so a test can hold a loader open while other callers arrive.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('MicroCacheService (cache-manager, in-memory LRU)', () => {
  let cache: MicroCacheService;
  let log: jest.SpyInstance;
  const logged = () => (log.mock.calls as unknown[][]).map((c) => c[0] as string);

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-16T00:00:00Z') });
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    cache = createInMemoryMicroCache(3);
  });

  afterEach(() => {
    log.mockRestore();
    jest.useRealTimers();
  });

  it('loads on miss and serves the cached value within the TTL', async () => {
    const loader = jest.fn().mockResolvedValue({ n: 1 });

    expect(await cache.getOrLoad('k', 10_000, loader)).toEqual({ n: 1 });
    jest.setSystemTime(Date.now() + 9_000);
    expect(await cache.getOrLoad('k', 10_000, loader)).toEqual({ n: 1 });

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('reloads once the TTL has elapsed', async () => {
    const loader = jest.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('new');

    await cache.getOrLoad('k', 10_000, loader);
    jest.setSystemTime(Date.now() + 10_001);

    expect(await cache.getOrLoad('k', 10_000, loader)).toBe('new');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('runs the loader once for concurrent misses on the same key (single-flight)', async () => {
    const d = deferred<string>();
    const loader = jest.fn(() => d.promise);

    const callers = Array.from({ length: 10 }, () => cache.getOrLoad('k', 10_000, loader));
    d.resolve('v');

    expect(await Promise.all(callers)).toEqual(Array(10).fill('v'));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed load: waiters reject, the next call retries', async () => {
    const d = deferred<string>();
    const loader = jest.fn(() => d.promise);

    const a = cache.getOrLoad('k', 10_000, loader);
    const b = cache.getOrLoad('k', 10_000, loader);
    d.reject(new Error('db down'));

    await expect(a).rejects.toThrow('db down');
    await expect(b).rejects.toThrow('db down');

    const retry = jest.fn().mockResolvedValue('ok');
    expect(await cache.getOrLoad('k', 10_000, retry)).toBe('ok');
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('keeps different keys apart', async () => {
    await cache.getOrLoad('a', 10_000, () => Promise.resolve('A'));
    expect(await cache.getOrLoad('b', 10_000, () => Promise.resolve('B'))).toBe('B');
  });

  it('evicts the least recently used entry beyond the size cap', async () => {
    for (const k of ['a', 'b', 'c', 'd']) await cache.getOrLoad(k, 10_000, () => Promise.resolve(k));

    const reloadA = jest.fn().mockResolvedValue('a2');
    const reloadD = jest.fn().mockResolvedValue('d2');
    expect(await cache.getOrLoad('a', 10_000, reloadA)).toBe('a2');
    expect(await cache.getOrLoad('d', 10_000, reloadD)).toBe('d');
    expect(reloadD).not.toHaveBeenCalled();
  });

  it('clear() drops every entry', async () => {
    await cache.getOrLoad('k', 10_000, () => Promise.resolve('v'));
    await cache.clear();
    const loader = jest.fn().mockResolvedValue('v2');
    expect(await cache.getOrLoad('k', 10_000, loader)).toBe('v2');
  });

  describe('logging', () => {
    it('logs the API with "Query database" on miss and the seconds left on a cache hit', async () => {
      await cache.getOrLoad('skill:list:x', 10_000, () => Promise.resolve(1), 'GET /v1/skill/items');
      jest.setSystemTime(Date.now() + 2_500);
      await cache.getOrLoad('skill:list:x', 10_000, () => Promise.resolve(2), 'GET /v1/skill/items');

      expect(logged()).toEqual(['[GET /v1/skill/items] Query database', '[GET /v1/skill/items] Lấy từ cache (còn 8s)']);
    });

    it('logs one "Query database" per database round; callers sharing it are logged as cache', async () => {
      const d = deferred<number>();
      const a = cache.getOrLoad('k', 10_000, () => d.promise, 'GET /v1/asset-hub/latest');
      const b = cache.getOrLoad('k', 10_000, () => d.promise, 'GET /v1/asset-hub/latest');
      d.resolve(1);
      await Promise.all([a, b]);

      expect(logged().filter((l) => l.endsWith('Query database'))).toEqual([
        '[GET /v1/asset-hub/latest] Query database',
      ]);
      expect(logged()).toContain('[GET /v1/asset-hub/latest] Lấy từ cache (còn 10s)');
    });

    it('falls back to the key as label', async () => {
      await cache.getOrLoad('stats:counts', 10_000, () => Promise.resolve(1));
      expect(logged()).toEqual(['[stats:counts] Query database']);
    });
  });
});

describe('MicroCacheModule (Nest DI)', () => {
  it('provides MicroCacheService backed by the registered cache-manager store', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [MicroCacheModule] }).compile();
    const service = moduleRef.get(MicroCacheService);
    const loader = jest.fn().mockResolvedValue('v');
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    expect(await service.getOrLoad('k', 10_000, loader)).toBe('v');
    expect(await service.getOrLoad('k', 10_000, loader)).toBe('v');
    expect(loader).toHaveBeenCalledTimes(1);

    log.mockRestore();
    await moduleRef.close();
  });
});

describe('stableCacheKey', () => {
  it('is independent of property order and ignores undefined', () => {
    expect(stableCacheKey('p', { b: 2, a: 1, c: undefined })).toBe(stableCacheKey('p', { a: 1, b: 2 }));
  });

  it('distinguishes different values and prefixes', () => {
    expect(stableCacheKey('p', { page: 1 })).not.toBe(stableCacheKey('p', { page: 2 }));
    expect(stableCacheKey('skill:list', { page: 1 })).not.toBe(stableCacheKey('prompt:list', { page: 1 }));
  });
});
