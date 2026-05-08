import { Injectable, Logger } from '@nestjs/common';
import { RedisAdapter } from '@common/infrastructure/redis.adapter';
import {
  DATA_ACCESS_CACHE_TTL,
  PERMISSION_CACHE_TTL,
  dataAccessCacheKey,
  permissionCacheKey,
} from '../constants/authorization.constant';
import { PermissionQueryService } from './permission-query.service';

@Injectable()
export class PermissionCacheService {
  private readonly logger = new Logger(PermissionCacheService.name);

  constructor(private readonly queryService: PermissionQueryService) {}

  async getPermissions(userId: number): Promise<Set<string>> {
    const key = permissionCacheKey(userId);
    try {
      const raw = (await RedisAdapter.get(key)) as string | null;
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch (err) {
      this.logger.warn(`Redis read failed for ${key}: ${this.errorMsg(err)}`);
    }

    const codes = await this.queryService.getUserPermissions(userId);
    try {
      await RedisAdapter.set(key, JSON.stringify(codes), PERMISSION_CACHE_TTL);
    } catch (err) {
      this.logger.warn(`Redis write failed for ${key}: ${this.errorMsg(err)}`);
    }
    return new Set(codes);
  }

  async hasPermission(userId: number, code: string): Promise<boolean> {
    return (await this.getPermissions(userId)).has(code);
  }

  async getAccessibleRecords(userId: number, tableName: string, permissionCode?: string): Promise<number[]> {
    const key = dataAccessCacheKey(userId, tableName, permissionCode);
    try {
      const raw = (await RedisAdapter.get(key)) as string | null;
      if (raw) return (JSON.parse(raw) as string[]).map(Number);
    } catch (err) {
      this.logger.warn(`Redis read failed for ${key}: ${this.errorMsg(err)}`);
    }

    const ids = await this.queryService.getAccessibleRecords(userId, tableName, permissionCode);
    try {
      await RedisAdapter.set(key, JSON.stringify(ids.map(String)), DATA_ACCESS_CACHE_TTL);
    } catch (err) {
      this.logger.warn(`Redis write failed for ${key}: ${this.errorMsg(err)}`);
    }
    return ids;
  }

  async invalidateUser(userId: number): Promise<void> {
    try {
      await RedisAdapter.unlinkKeyByPattern(`${permissionCacheKey(userId).replace(':codes', '')}:*`);
    } catch (err) {
      this.logger.error(`Redis invalidate user ${userId} failed: ${this.errorMsg(err)}`);
    }
  }

  async invalidateByRole(roleId: number): Promise<void> {
    const userIds = await this.queryService.getUserIdsByRole(roleId);
    await Promise.all(userIds.map((userId) => this.invalidateUser(userId)));
  }

  async invalidateByTable(tableName: string): Promise<void> {
    try {
      await RedisAdapter.unlinkKeyByPattern(`perm:user:*:da:${tableName}*`);
    } catch (err) {
      this.logger.error(`Redis invalidate table ${tableName} failed: ${this.errorMsg(err)}`);
    }
  }

  async invalidateAll(): Promise<void> {
    try {
      await RedisAdapter.unlinkKeyByPattern('perm:user:*');
    } catch (err) {
      this.logger.error(`Redis invalidate all failed: ${this.errorMsg(err)}`);
    }
  }

  private errorMsg(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try {
      return JSON.stringify(err);
    } catch {
      return 'Unknown error';
    }
  }
}
