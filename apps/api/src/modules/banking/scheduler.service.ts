import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../../common/infra';
import { QueueService } from '../core/queue.service';
import { LoansService } from './loans.service';
import { ProductsService } from './products.service';
import { TransfersService } from './transfers.service';

/** One repeatable "tick" every minute drives all time-based banking jobs. */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger('Scheduler');

  constructor(
    private readonly queues: QueueService,
    private readonly redis: RedisService,
    private readonly transfers: TransfersService,
    private readonly products: ProductsService,
    private readonly loans: LoansService,
  ) {}

  async onModuleInit() {
    this.queues.process('scheduler', () => this.tick(), 1);
    await this.queues.add('scheduler', 'tick', {}, { repeat: { every: 60_000 }, jobId: 'tick' });
  }

  async tick() {
    const results: Record<string, number> = {};
    results.scheduledTransfers = await this.transfers.runDueScheduled();
    results.autoSaves = await this.products.runAutoSaves();
    results.maturedDeposits = await this.products.matureFixedDeposits();
    // Hourly: loan repayment collection.
    if (await this.redis.client.set('job:loans', '1', 'EX', 3600, 'NX')) results.loanRepayments = await this.loans.processDueRepayments();
    // Monthly: savings interest (once per calendar month).
    const month = new Date().toISOString().slice(0, 7);
    if (new Date().getDate() === 1 && (await this.redis.client.set(`job:interest:${month}`, '1', 'EX', 40 * 86400, 'NX'))) {
      results.interest = await this.products.paySavingsInterest();
    }
    const busy = Object.entries(results).filter(([, v]) => v > 0);
    if (busy.length) this.logger.log(`tick ${JSON.stringify(Object.fromEntries(busy))}`);
    return results;
  }
}
