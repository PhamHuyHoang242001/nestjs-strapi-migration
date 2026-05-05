import { Global, Module } from '@nestjs/common';
import { REDIS_HOST, REDIS_PORT } from '@configuration/env.config';
import Redis from 'ioredis';
import { DataAccessInterceptor } from './interceptors/data-access.interceptor';
import { PermissionGuard } from './guards/permission.guard';
import { PermissionCacheService } from './services/permission-cache.service';
import { PermissionQueryService } from './services/permission-query.service';

export const REDIS_CLIENT = 'AUTHORIZATION_REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const redis = new Redis({
          host: REDIS_HOST,
          port: REDIS_PORT,
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
        });
        redis.on('error', () => undefined);
        return redis;
      },
    },
    PermissionQueryService,
    PermissionCacheService,
    PermissionGuard,
    DataAccessInterceptor,
  ],
  exports: [REDIS_CLIENT, PermissionQueryService, PermissionCacheService, PermissionGuard, DataAccessInterceptor],
})
export class AuthorizationModule {}
