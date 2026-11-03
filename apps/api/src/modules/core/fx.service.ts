import { Injectable } from '@nestjs/common';
import { CURRENCIES, convert, toMoney } from '@onebank/shared';
import Decimal from 'decimal.js';
import { AppError } from '../../common/app-error';
import { randomToken } from '../../common/crypto';
import { PrismaService, RedisService } from '../../common/infra';

export interface FxQuote {
  id: string;
  from: string;
  to: string;
  amount: string;
  rate: string;
  midRate: string;
  converted: string;
  spread: string;
  expiresAt: number;
}

/** Rates are stored as USD -> X. Cross rates are derived via USD. */
@Injectable()
export class FxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async table(): Promise<Record<string, { rate: Decimal; spread: Decimal }>> {
    const rows = await this.prisma.fxRate.findMany({ where: { base: 'USD' } });
    const t: Record<string, { rate: Decimal; spread: Decimal }> = { USD: { rate: new Decimal(1), spread: new Decimal(0) } };
    for (const r of rows) t[r.quote] = { rate: new Decimal(r.rate.toString()), spread: new Decimal(r.spread.toString()) };
    return t;
  }

  async midRate(from: string, to: string): Promise<Decimal> {
    if (from === to) return new Decimal(1);
    const t = await this.table();
    if (!t[from] || !t[to]) throw new AppError('VALIDATION', `Unsupported currency pair ${from}/${to}`);
    return t[to].rate.div(t[from].rate);
  }

  /** Spread charged = the larger of the two legs' configured spreads. */
  async spread(from: string, to: string): Promise<Decimal> {
    if (from === to) return new Decimal(0);
    const t = await this.table();
    return Decimal.max(t[from]?.spread ?? 0, t[to]?.spread ?? 0);
  }

  async toUsd(amount: Decimal.Value, currency: string): Promise<Decimal> {
    if (currency === 'USD') return new Decimal(amount);
    return new Decimal(amount).mul(await this.midRate(currency, 'USD'));
  }

  async fromUsd(amountUsd: Decimal.Value, currency: string): Promise<Decimal> {
    if (currency === 'USD') return toMoney(amountUsd);
    return toMoney(new Decimal(amountUsd).mul(await this.midRate('USD', currency)));
  }

  async quote(from: string, to: string, amount: Decimal.Value, userId: string): Promise<FxQuote> {
    if (from === to) throw new AppError('VALIDATION', 'Choose two different currencies');
    const mid = await this.midRate(from, to);
    const spread = await this.spread(from, to);
    const { rate, converted } = convert(amount, mid, spread);
    const q: FxQuote = {
      id: randomToken(12),
      from,
      to,
      amount: toMoney(amount).toFixed(2),
      rate: rate.toString(),
      midRate: mid.toDecimalPlaces(8).toString(),
      converted: converted.toFixed(2),
      spread: spread.toString(),
      expiresAt: Date.now() + 30_000,
    };
    await this.redis.setJson(`fxq:${userId}:${q.id}`, q, 35);
    return q;
  }

  async consumeQuote(userId: string, id: string): Promise<FxQuote> {
    const key = `fxq:${userId}:${id}`;
    const q = await this.redis.getJson<FxQuote>(key);
    if (!q || q.expiresAt < Date.now()) throw new AppError('CONFLICT', 'This quote has expired. Please get a new quote.');
    await this.redis.client.del(key);
    return q;
  }

  async publicRates() {
    const t = await this.table();
    const out: { pair: string; from: string; to: string; mid: string; buy: string }[] = [];
    for (const from of CURRENCIES) {
      for (const to of CURRENCIES) {
        if (from === to || !t[from] || !t[to]) continue;
        const mid = t[to].rate.div(t[from].rate);
        const spread = Decimal.max(t[from].spread, t[to].spread);
        out.push({ pair: `${from}/${to}`, from, to, mid: mid.toDecimalPlaces(6).toString(), buy: convert(1, mid, spread).rate.toDecimalPlaces(6).toString() });
      }
    }
    return out;
  }
}
