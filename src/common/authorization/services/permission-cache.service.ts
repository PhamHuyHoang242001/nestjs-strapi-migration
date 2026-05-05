import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../authorization.module';
import {
  DATA_ACCESS_CACHE_TTL,
  EMPTY_SET_SENTINEL,
  PERMISSION_CACHE_TTL,
  REDIS_PERM_PREFIX,
  dataAccessCacheKey,
  permissionCacheKey,
} from '../constants/authorization.constant';
import { PermissionQueryService } from './permission-query.service';

@Injectable()
export class PermissionCacheService {
  private readonly logger = new Logger(PermissionCacheService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly queryService: PermissionQueryService,
  ) {}

  async getPermissions(userId: number): Promise<Set<string>> {
    const key = permissionCacheKey(userId);
    const cached = await this.readSet(key);
    if (cached) return new Set(cached.filter((code) => code !== EMPTY_SET_SENTINEL));

    const codes = await this.queryService.getUserPermissions(userId);
    await this.writeSet(key, codes, PERMISSION_CACHE_TTL);
    return new Set(codes);
  }

  async hasPermission(userId: number, code: string): Promise<boolean> {
    const key = permissionCacheKey(userId);
    try {
      if (await this.redis.exists(key)) return (await this.redis.sismember(key, code)) === 1;
    } catch (err) {
      this.logger.warn(`Redis permission check failed for ${key}: ${this.getErrorMessage(err)}`);
    }

    return (await this.getPermissions(userId)).has(code);
  }

  async getAccessibleRecords(userId: number, tableName: string, permissionCode?: string): Promise<number[]> {
    const key = dataAccessCacheKey(userId, tableName, permissionCode);
    const cached = await this.readSet(key);
    if (cached) return cached.filter((value) => value !== EMPTY_SET_SENTINEL).map(Number);

    const ids = await this.queryService.getAccessibleRecords(userId, tableName, permissionCode);
    await this.writeSet(key, ids.map(String), DATA_ACCESS_CACHE_TTL);
    return ids;
  }

  async invalidateUser(userId: number): Promise<void> {
    await this.deleteByPattern(`${REDIS_PERM_PREFIX}:${userId}:*`);
  }

  async invalidateByRole(roleId: number): Promise<void> {
    const userIds = await this.queryService.getUserIdsByRole(roleId);
    await Promise.all(userIds.map((userId) => this.invalidateUser(userId)));
  }

  async invalidateByTable(tableName: string): Promise<void> {
    await this.deleteByPattern(`${REDIS_PERM_PREFIX}:*:da:${tableName}*`);
  }

  async invalidateAll(): Promise<void> {
    await this.deleteByPattern(`${REDIS_PERM_PREFIX}:*`);
  }

  private async readSet(key: string): Promise<string[] | null> {
    try {
      const values = await this.redis.smembers(key);
      return values.length > 0 ? values : null;
    } catch (err) {
      this.logger.warn(`Redis read failed for ${key}: ${this.getErrorMessage(err)}`);
      return null;
    }
  }

  private async writeSet(key: string, values: string[], ttl: number): Promise<void> {
    try {
      await this.redis.sadd(key, ...(values.length ? values : [EMPTY_SET_SENTINEL]));
      await this.redis.expire(key, ttl);
    } catch (err) {
      this.logger.warn(`Redis write failed for ${key}: ${this.getErrorMessage(err)}`);
    }
  }

  private async deleteByPattern(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) await this.redis.del(...keys);
      } while (cursor !== '0');
    } catch (err) {
      this.logger.error(`Redis delete failed for ${pattern}: ${this.getErrorMessage(err)}`);
    }
  }

  private getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try {
      return JSON.stringify(err);
    } catch {
      return 'Unknown error';
    }
  }
}
