import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { config } from '../config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  readonly subscriber = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

  async getJson<T>(key: string): Promise<T | null> {
    const v = await this.client.get(key);
    return v ? (JSON.parse(v) as T) : null;
  }
  async setJson(key: string, value: unknown, ttlSeconds: number) {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }
  async onModuleDestroy() {
    this.client.disconnect();
    this.subscriber.disconnect();
  }
}
