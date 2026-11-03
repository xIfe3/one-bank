import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Job, JobsOptions, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../../config';

export type QueueName = 'email' | 'settlement' | 'scheduler';

/**
 * Thin wrapper over BullMQ. Processors are registered by feature services at startup;
 * when workers are disabled (tests), `add` runs nothing and callers drive processing directly.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger('Queue');
  private readonly connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  private readonly queues = new Map<QueueName, Queue>();
  private readonly workers: Worker[] = [];

  queue(name: QueueName): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: this.connection, prefix: 'onebank' });
      this.queues.set(name, q);
    }
    return q;
  }

  async add(name: QueueName, jobName: string, data: unknown, opts: JobsOptions = {}) {
    if (config.disableWorkers) return null;
    return this.queue(name).add(jobName, data, { removeOnComplete: 1000, removeOnFail: 5000, ...opts });
  }

  process(name: QueueName, handler: (job: Job) => Promise<unknown>, concurrency = 5) {
    if (config.disableWorkers) return;
    const worker = new Worker(
      name,
      async (job) => {
        try {
          return await handler(job);
        } catch (e) {
          this.logger.error(`${name}:${job.name} failed (attempt ${job.attemptsMade + 1})`, e instanceof Error ? e.stack : String(e));
          throw e;
        }
      },
      { connection: new Redis(config.redisUrl, { maxRetriesPerRequest: null }), prefix: 'onebank', concurrency },
    );
    this.workers.push(worker);
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.connection.disconnect();
  }
}
