import { RedisAdapter } from '@common/infrastructure/redis.adapter';
import { ConfigDataSelfServe } from '@modules/databases/config-data-self-serve.entity';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as dayjs from 'dayjs';
import { Repository } from 'typeorm';

const LOCK_TTL_SECONDS = 3;
const MAX_RETRY = 30;
const RETRY_DELAY_MS = 100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class DataSelfServeQuotaService {
  constructor(
    @InjectRepository(ConfigDataSelfServe)
    private readonly configRepo: Repository<ConfigDataSelfServe>,
  ) {}

  async getRemaining(userId: number, requestGroup: string) {
    const config = await this.getQuotaConfig(requestGroup);
    const key = this.userQuotaKey(requestGroup, userId);
    const current = await RedisAdapter.get(key);
    const userDailyLimit = Number(config.value?.user_daily_limit ?? 0);
    return {
      user_remain: current === null ? userDailyLimit : Number(current),
      user_daily_limit: userDailyLimit,
    };
  }

  async consume(userId: number, requestGroup: string) {
    const key = this.userQuotaKey(requestGroup, userId);
    const lockKey = `${key}:lock`;
    const ttl = this.secondsUntilEndOfDay();

    for (let attempt = 1; attempt <= MAX_RETRY; attempt += 1) {
      const locked = await RedisAdapter.setNx(lockKey, `${Date.now()}`, LOCK_TTL_SECONDS);
      if (!locked) {
        if (attempt === MAX_RETRY) throw new BadRequestException('Service is busy, please retry');
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      try {
        const remain = await RedisAdapter.get(key);
        if (remain !== null) return this.consumeExisting(key, Number(remain), ttl);

        const config = await this.getQuotaConfig(requestGroup);
        const limit = Number(config.value?.user_daily_limit ?? 0);
        if (limit <= 0) throw new BadRequestException('Daily usage limit exceeded');
        await RedisAdapter.set(key, `${limit - 1}`, ttl);
        return;
      } finally {
        await RedisAdapter.del(lockKey);
      }
    }
  }

  private async consumeExisting(key: string, remain: number, ttl: number) {
    if (remain <= 0) throw new BadRequestException('Daily usage limit exceeded');
    await RedisAdapter.set(key, `${remain - 1}`, ttl);
  }

  private async getQuotaConfig(requestGroup: string) {
    const config = await this.configRepo.findOne({ where: { key: requestGroup } });
    if (!config) throw new BadRequestException('Service usage is not configured');
    return config;
  }

  private userQuotaKey(requestGroup: string, userId: number) {
    return `data_self_service:${requestGroup}:${userId}:${dayjs().format('YYYYMMDD')}`;
  }

  private secondsUntilEndOfDay() {
    return dayjs().endOf('day').diff(dayjs(), 'second');
  }
}
