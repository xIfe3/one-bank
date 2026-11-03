import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { ENTRY_TYPE_LABELS, type EntryType } from '@onebank/shared';
import Decimal from 'decimal.js';
import { PrismaService } from '../../common/infra';
import { FxService } from '../core/fx.service';

/** Customer spending analytics, normalised to the user's base currency. */
@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: FxService,
  ) {}

  async analytics(user: User, months = 6) {
    const since = new Date();
    since.setMonth(since.getMonth() - (months - 1), 1);
    since.setHours(0, 0, 0, 0);
    const rows = await this.prisma.$queryRaw<{ month: string; currency: string; inflow: string; outflow: string }[]>`
      SELECT to_char(date_trunc('month', e."valueDate"), 'YYYY-MM') AS month, a.currency,
        COALESCE(SUM(CASE WHEN p.amount > 0 THEN p.amount ELSE 0 END),0)::text AS inflow,
        COALESCE(SUM(CASE WHEN p.amount < 0 THEN -p.amount ELSE 0 END),0)::text AS outflow
      FROM "Posting" p JOIN "LedgerAccount" a ON a.id = p."accountId" JOIN "JournalEntry" e ON e.id = p."entryId"
      WHERE a."ownerId" = ${user.id} AND a.type = 'CUSTOMER_WALLET' AND e."valueDate" >= ${since}
        AND e.type NOT IN ('SAVINGS_TRANSFER', 'FX', 'CARD_FUNDING', 'CARD_WITHDRAWAL')
      GROUP BY 1, 2 ORDER BY 1`;
    const cats = await this.prisma.$queryRaw<{ category: string | null; type: string; currency: string; total: string }[]>`
      SELECT e.category, e.type::text AS type, a.currency, SUM(-p.amount)::text AS total
      FROM "Posting" p JOIN "LedgerAccount" a ON a.id = p."accountId" JOIN "JournalEntry" e ON e.id = p."entryId"
      WHERE a."ownerId" = ${user.id} AND a.type IN ('CUSTOMER_WALLET', 'CARD') AND p.amount < 0 AND e."valueDate" >= ${since}
        AND e.type NOT IN ('SAVINGS_TRANSFER', 'FX', 'CARD_FUNDING', 'CARD_WITHDRAWAL')
      GROUP BY 1, 2, 3`;
    const top = await this.prisma.$queryRaw<{ name: string; currency: string; total: string; count: bigint }[]>`
      SELECT e."counterpartyName" AS name, a.currency, SUM(-p.amount)::text AS total, COUNT(*) AS count
      FROM "Posting" p JOIN "LedgerAccount" a ON a.id = p."accountId" JOIN "JournalEntry" e ON e.id = p."entryId"
      WHERE a."ownerId" = ${user.id} AND a.type IN ('CUSTOMER_WALLET', 'CARD') AND p.amount < 0 AND e."valueDate" >= ${since}
        AND e."counterpartyName" IS NOT NULL AND e.type IN ('INTERNAL_TRANSFER', 'INTERBANK', 'WIRE', 'BILL', 'CARD_SPEND')
      GROUP BY 1, 2`;

    const base = user.baseCurrency;
    const conv = async (amt: string, cur: string) => (await this.fx.toUsd(amt, cur)).mul(await this.fx.midRate('USD', base));

    const monthsMap = new Map<string, { month: string; inflow: Decimal; outflow: Decimal }>();
    for (let i = 0; i < months; i++) {
      const d = new Date(since);
      d.setMonth(since.getMonth() + i);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthsMap.set(k, { month: k, inflow: new Decimal(0), outflow: new Decimal(0) });
    }
    for (const r of rows) {
      const m = monthsMap.get(r.month);
      if (!m) continue;
      m.inflow = m.inflow.plus(await conv(r.inflow, r.currency));
      m.outflow = m.outflow.plus(await conv(r.outflow, r.currency));
    }
    const catMap = new Map<string, Decimal>();
    for (const c of cats) {
      const name = c.category ?? ENTRY_TYPE_LABELS[c.type as EntryType] ?? c.type;
      catMap.set(name, (catMap.get(name) ?? new Decimal(0)).plus(await conv(c.total, c.currency)));
    }
    const topMap = new Map<string, { total: Decimal; count: number }>();
    for (const t of top) {
      const cur = topMap.get(t.name) ?? { total: new Decimal(0), count: 0 };
      topMap.set(t.name, { total: cur.total.plus(await conv(t.total, t.currency)), count: cur.count + Number(t.count) });
    }
    const monthly = [...monthsMap.values()].map((m) => ({ month: m.month, inflow: m.inflow.toFixed(2), outflow: m.outflow.toFixed(2) }));
    const totalOut = [...catMap.values()].reduce((s, v) => s.plus(v), new Decimal(0));
    return {
      currency: base,
      monthly,
      categories: [...catMap.entries()]
        .map(([name, v]) => ({ name, total: v.toFixed(2), percent: totalOut.isZero() ? 0 : Number(v.div(totalOut).mul(100).toFixed(1)) }))
        .sort((a, b) => Number(b.total) - Number(a.total)),
      topRecipients: [...topMap.entries()]
        .map(([name, v]) => ({ name, total: v.total.toFixed(2), count: v.count }))
        .sort((a, b) => Number(b.total) - Number(a.total))
        .slice(0, 6),
      totals: {
        inflow: monthly.reduce((s, m) => s.plus(m.inflow), new Decimal(0)).toFixed(2),
        outflow: monthly.reduce((s, m) => s.plus(m.outflow), new Decimal(0)).toFixed(2),
      },
    };
  }
}
