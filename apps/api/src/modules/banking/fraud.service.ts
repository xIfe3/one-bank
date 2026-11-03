import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../../common/infra';
import { FxService } from '../core/fx.service';

export interface FraudContext {
  userId: string;
  sessionId?: string;
  entryId: string;
  amountUsd: Decimal;
  recipientAccount: string;
  fromAccountId: string;
}

export interface FraudHit {
  rule: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  details: string;
}

/** Simple, explainable rules. HIGH severity holds outbound external transfers for review. */
@Injectable()
export class FraudService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: FxService,
  ) {}

  async evaluate(ctx: FraudContext): Promise<FraudHit[]> {
    const hits: FraudHit[] = [];
    const amount = ctx.amountUsd.toNumber();

    if (ctx.sessionId && amount >= 1000) {
      const session = await this.prisma.session.findUnique({ where: { id: ctx.sessionId } });
      if (session && Date.now() - session.createdAt.getTime() < 24 * 3600_000) {
        const seenBefore = await this.prisma.loginEvent.count({
          where: { userId: ctx.userId, success: true, browser: session.browser, os: session.os, createdAt: { lt: new Date(session.createdAt.getTime() - 1000) } },
        });
        if (!seenBefore) hits.push({ rule: 'NEW_DEVICE_LARGE_OUTBOUND', severity: 'HIGH', details: `$${amount.toFixed(2)} sent from a device first seen ${session.createdAt.toISOString()}` });
      }
    }

    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    const recent = await this.prisma.transfer.count({ where: { userId: ctx.userId, createdAt: { gte: tenMinAgo } } });
    if (recent > 5) hits.push({ rule: 'VELOCITY', severity: recent > 10 ? 'HIGH' : 'MEDIUM', details: `${recent} transfers in the last 10 minutes` });

    if (amount >= 2000) {
      const prior = await this.prisma.transfer.count({ where: { userId: ctx.userId, recipientAccount: ctx.recipientAccount, entryId: { not: ctx.entryId }, status: 'COMPLETED' } });
      if (!prior) hits.push({ rule: 'FIRST_TIME_LARGE_BENEFICIARY', severity: amount >= 5000 ? 'HIGH' : 'MEDIUM', details: `First transfer to ${ctx.recipientAccount} is $${amount.toFixed(2)}` });
    }

    const dayAgo = new Date(Date.now() - 24 * 3600_000);
    const credits = await this.prisma.posting.findMany({ where: { accountId: ctx.fromAccountId, amount: { gt: 0 }, createdAt: { gte: dayAgo } }, include: { account: true } });
    let creditUsd = new Decimal(0);
    for (const c of credits) creditUsd = creditUsd.plus(await this.fx.toUsd(c.amount.toString(), c.account.currency));
    if (creditUsd.gte(1000) && ctx.amountUsd.gte(creditUsd.mul(0.8))) {
      hits.push({ rule: 'DRAIN_AFTER_CREDIT', severity: 'MEDIUM', details: `$${amount.toFixed(2)} out within 24h of $${creditUsd.toFixed(2)} in` });
    }

    for (const h of hits) {
      await this.prisma.fraudFlag.create({ data: { userId: ctx.userId, entryId: ctx.entryId, rule: h.rule, severity: h.severity, details: h.details } });
    }
    return hits;
  }
}
