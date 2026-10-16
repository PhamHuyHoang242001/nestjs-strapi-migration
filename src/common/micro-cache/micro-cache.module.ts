import { Global, Module } from '@nestjs/common';
import { MicroCacheService } from './micro-cache.service';

// Global so read services can inject the shared cache without re-importing the module.
// Factory provider: the service's constructor takes plain values (size cap, clock) that Nest
// cannot resolve as dependencies, so it is built with its defaults here.
@Global()
@Module({
  providers: [{ provide: MicroCacheService, useFactory: () => new MicroCacheService() }],
  exports: [MicroCacheService],
})
export class MicroCacheModule {}
