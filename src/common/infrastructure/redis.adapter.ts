import { REDIS_HOST, REDIS_PORT } from '@configuration/env.config';
import Redis from 'ioredis';

export class RedisAdapter {
  private static client: Redis | null = null;

  private static getClient(): Redis {
    if (!this.client) {
      this.client = new Redis({ host: REDIS_HOST, port: REDIS_PORT });
    }
    return this.client;
  }

  static async get(key: string): Promise<string | null> {
    return this.getClient().get(key);
  }

  static async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.getClient().set(key, value, 'EX', ttlSeconds);
      return;
    }
    await this.getClient().set(key, value);
  }

  static async unlinkKeyByPattern(pattern: string): Promise<number> {
    const client = this.getClient();
    const keys = await client.keys(pattern);
    if (!keys.length) return 0;
    return client.unlink(...keys);
  }
}
