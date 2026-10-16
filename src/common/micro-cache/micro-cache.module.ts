import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { createCache } from 'cache-manager';
import { createKeyv } from 'cacheable';
import { MICRO_CACHE_MAX_ENTRIES, MicroCacheService } from './micro-cache.service';

// In-memory LRU store; shared by the module and by specs that build the service directly.
export function microCacheStores(maxEntries = MICRO_CACHE_MAX_ENTRIES) {
  return [createKeyv({ lruSize: maxEntries })];
}

// Standalone in-memory instance (outside Nest DI), e.g. for specs.
export function createInMemoryMicroCache(maxEntries = MICRO_CACHE_MAX_ENTRIES): MicroCacheService {
  return new MicroCacheService(createCache({ stores: microCacheStores(maxEntries) }));
}

// Global so read services can inject the shared cache without re-importing the module.
// Store: in-memory LRU (single backend instance). To share the cache across several instances,
// swap this store for a Redis Keyv store (e.g. @keyv/redis) — MicroCacheService and its callers
// stay unchanged.
@Global()
@Module({
  imports: [CacheModule.register({ stores: microCacheStores() })],
  providers: [MicroCacheService],
  exports: [MicroCacheService],
})
export class MicroCacheModule {}
