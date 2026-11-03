import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { formatMoney, toMoney } from '@onebank/shared';
import Decimal from 'decimal.js';
import { AppError, notFound } from '../../common/app-error';
import { PrismaService } from '../../common/infra';
import { AuthService } from '../auth/auth.service';
import { FxService } from '../core/fx.service';
import { LedgerService } from '../core/ledger.service';
import { MoneyGuardService } from '../core/money-guard.service';
import { NotificationsService } from '../core/notifications.service';
import { SettingsService } from '../core/settings.service';

export interface TxFilter {
  accountId?: string;
  type?: string;
  status?: string;
  currency?: string;
  direction?: 'in' | 'out';
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly fx: FxService,
    private readonly guard: MoneyGuardService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly auth: AuthService,
  ) {}

  async list(userId: string) {
    const accounts = await this.prisma.ledgerAccount.findMany({
      where: { ownerId: userId, status: { not: 'CLOSED' } },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    return accounts.map((a) => ({
      id: a.id,
      type: a.type,
      name: a.name,
      currency: a.currency,
      accountNumber: a.accountNumber,
      balance: a.balance.toFixed(2),
      availableBalance: a.availableBalance.toFixed(2),
      status: a.status,
      isPrimary: a.isPrimary,
      createdAt: a.createdAt,
    }));
  }

  async summary(user: User) {
    const accounts = await this.list(user.id);
    let total = new Decimal(0);
    for (const a of accounts) {
      if (a.type === 'LOAN') continue;
      total = total.plus((await this.fx.toUsd(a.balance, a.currency)).mul(await this.fx.midRate('USD', user.baseCurrency)));
    }
    return { baseCurrency: user.baseCurrency, totalBalance: toMoney(total).toFixed(2), accounts };
  }

  async open(user: User, currency: string) {
    if (user.status !== 'ACTIVE') throw new AppError('ACCOUNT_SUSPENDED', 'Your account must be active to open new accounts.');
    const existing = await this.prisma.ledgerAccount.findFirst({ where: { ownerId: user.id, type: 'CUSTOMER_WALLET', currency, status: { not: 'CLOSED' } } });
    if (existing) throw new AppError('CONFLICT', `You already have a ${currency} account.`);
    const acct = await this.prisma.ledgerAccount.create({
      data: { type: 'CUSTOMER_WALLET', currency, ownerId: user.id, accountNumber: await this.auth.uniqueAccountNumber(), name: `${currency} Account` },
    });
    await this.notifications.notify(user.id, { category: 'ACCOUNT', type: 'ACCOUNT_OPENED', title: `${currency} account opened`, body: `Your new account number is ${acct.accountNumber}.`, link: '/app/accounts', skipEmail: true });
    return acct;
  }

  /** Simulated "add money" from an external card/bank: BANK_EQUITY -> wallet. */
  async deposit(user: User, input: { accountId: string; amount: number; method: 'CARD' | 'BANK'; pin: string; otp?: string; idempotencyKey: string }) {
    await this.settings.assertFeature('deposits');
    const key = `${user.id}:${input.idempotencyKey}`;
    const prior = await this.ledger.findByIdempotencyKey(key);
    if (prior) return prior;
    const acct = await this.guard.ownedAccount(user.id, input.accountId);
    this.guard.assertUserCanTransact(user);
    await this.guard.verifyPin(user, input.pin);
    const s = await this.settings.get();
    const amountUsd = await this.fx.toUsd(input.amount, acct.currency);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const today = await this.prisma.$queryRaw<{ currency: string; total: string }[]>`
      SELECT a.currency, COALESCE(SUM(p.amount),0)::text AS total FROM "Posting" p
      JOIN "LedgerAccount" a ON a.id = p."accountId" JOIN "JournalEntry" e ON e.id = p."entryId"
      WHERE a."ownerId" = ${user.id} AND e.type = 'DEPOSIT' AND e."initiatorType" = 'USER' AND p.amount > 0 AND p."createdAt" >= ${start}
      GROUP BY a.currency`;
    let usedUsd = new Decimal(0);
    for (const r of today) usedUsd = usedUsd.plus(await this.fx.toUsd(r.total, r.currency));
    if (usedUsd.plus(amountUsd).gt(s.depositDailyCapUsd)) {
      throw new AppError('LIMIT_EXCEEDED', `Top-ups are limited to $${s.depositDailyCapUsd.toLocaleString()} per day (USD equivalent).`);
    }
    const equity = await this.ledger.systemAccountId('BANK_EQUITY', acct.currency);
    const amount = toMoney(input.amount);
    const entry = await this.ledger.run((tx) =>
      this.ledger.post(tx, {
        type: 'DEPOSIT',
        description: input.method === 'CARD' ? 'Top-up from debit card' : 'Deposit from linked bank account',
        category: 'Income',
        legs: [
          { accountId: equity, amount: amount.negated() },
          { accountId: acct.id, amount },
        ],
        idempotencyKey: key,
        counterpartyName: input.method === 'CARD' ? 'Visa •••• 4242' : 'Linked bank account',
        initiatorId: user.id,
      }),
    );
    await this.creditNotice(user.id, acct.id, entry.id);
    return entry;
  }

  /** Notify a customer that one of their accounts was credited by an entry. */
  async creditNotice(userId: string, accountId: string, entryId: string) {
    const [acct, entry] = await Promise.all([
      this.prisma.ledgerAccount.findUniqueOrThrow({ where: { id: accountId } }),
      this.prisma.journalEntry.findUniqueOrThrow({ where: { id: entryId }, include: { postings: { where: { accountId } } } }),
    ]);
    const amt = entry.postings.reduce((s, p) => s.plus(p.amount.toString()), new Decimal(0));
    await this.notifications.notify(userId, {
      category: 'TRANSACTIONS',
      type: 'CREDIT',
      title: `You received ${formatMoney(amt, acct.currency)}`,
      body: `${entry.description}${entry.counterpartyName ? ` · from ${entry.counterpartyName}` : ''}`,
      link: `/app/transactions/${entry.id}`,
      email: {
        template: 'money-received',
        data: {
          amount: formatMoney(amt, acct.currency),
          from: entry.counterpartyName ?? 'One Bank',
          description: entry.description,
          reference: entry.reference,
          balance: formatMoney(acct.balance.toString(), acct.currency),
          entryId: entry.id,
        },
      },
    });
    await this.notifications.balanceChanged(userId);
  }

  async debitNotice(userId: string, accountId: string, entryId: string, extra: { to: string; fee?: Decimal.Value; amount: Decimal.Value }) {
    const [acct, entry] = await Promise.all([
      this.prisma.ledgerAccount.findUniqueOrThrow({ where: { id: accountId } }),
      this.prisma.journalEntry.findUniqueOrThrow({ where: { id: entryId } }),
    ]);
    const s = await this.settings.get();
    await this.notifications.notify(userId, {
      category: 'TRANSACTIONS',
      type: 'DEBIT',
      title: `${entry.status === 'PENDING' ? 'Transfer submitted' : 'Debit'}: ${formatMoney(extra.amount, acct.currency)}`,
      body: `${entry.description} · to ${extra.to}`,
      link: `/app/transactions/${entry.id}`,
      email: {
        template: 'money-sent',
        data: {
          amount: formatMoney(extra.amount, acct.currency),
          fee: extra.fee && !new Decimal(extra.fee).isZero() ? formatMoney(extra.fee, acct.currency) : undefined,
          to: extra.to,
          description: entry.description,
          reference: entry.reference,
          status: entry.status,
          balance: formatMoney(acct.availableBalance.toString(), acct.currency),
          entryId: entry.id,
        },
      },
    });
    await this.notifications.balanceChanged(userId);
    const availUsd = await this.fx.toUsd(acct.availableBalance.toString(), acct.currency);
    if (acct.type === 'CUSTOMER_WALLET' && availUsd.lt(s.lowBalanceUsd)) {
      await this.notifications.notify(userId, {
        category: 'ACCOUNT',
        type: 'LOW_BALANCE',
        title: 'Low balance',
        body: `Your ${acct.currency} account has ${formatMoney(acct.availableBalance.toString(), acct.currency)} available.`,
        link: '/app/accounts',
        email: { template: 'low-balance', data: { currency: acct.currency, last4: acct.accountNumber?.slice(-4), balance: formatMoney(acct.availableBalance.toString(), acct.currency) } },
      });
    }
  }

  // ---------- transactions ----------

  async transactions(userId: string, f: TxFilter, opts: { adminView?: boolean } = {}) {
    const page = Math.max(1, Number(f.page ?? 1));
    const pageSize = Math.min(100, Math.max(5, Number(f.pageSize ?? 20)));
    const accountWhere: Prisma.LedgerAccountWhereInput = { ownerId: userId, ...(f.accountId ? { id: f.accountId } : {}), ...(f.currency ? { currency: f.currency } : {}) };
    const entryWhere: Prisma.JournalEntryWhereInput = {
      ...(f.type ? { type: f.type as never } : {}),
      ...(f.q
        ? {
            OR: [
              { description: { contains: f.q, mode: 'insensitive' } },
              { reference: { contains: f.q, mode: 'insensitive' } },
              { counterpartyName: { contains: f.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const dateWhere = { ...(f.from ? { gte: new Date(f.from) } : {}), ...(f.to ? { lte: new Date(new Date(f.to).getTime() + 86_399_999) } : {}) };
    const hasDate = !!(f.from || f.to);

    const showPosted = !f.status || f.status === 'COMPLETED' || f.status === 'REVERSED';
    const showUnposted = !f.status || f.status === 'PENDING' || f.status === 'FAILED';

    const postingWhere: Prisma.PostingWhereInput = {
      account: accountWhere,
      entry: { ...entryWhere, ...(f.status ? { status: f.status as never } : {}), ...(hasDate ? { valueDate: dateWhere } : {}) },
      ...(f.direction === 'in' ? { amount: { gt: 0 } } : f.direction === 'out' ? { amount: { lt: 0 } } : {}),
    };

    const [postings, total] = showPosted
      ? await Promise.all([
          this.prisma.posting.findMany({
            where: postingWhere,
            include: { entry: true, account: true },
            orderBy: [{ entry: { valueDate: 'desc' } }, { createdAt: 'desc' }],
            take: pageSize,
            skip: (page - 1) * pageSize,
          }),
          this.prisma.posting.count({ where: postingWhere }),
        ])
      : [[], 0];

    // Pending / failed entries have holds instead of postings.
    const holds =
      showUnposted && page === 1 && f.direction !== 'in'
        ? await this.prisma.hold.findMany({
            where: {
              entry: { ...entryWhere, status: f.status ? (f.status as never) : { in: ['PENDING', 'FAILED'] }, ...(hasDate ? { valueDate: dateWhere } : {}) },
              accountId: { in: (await this.prisma.ledgerAccount.findMany({ where: accountWhere, select: { id: true } })).map((a) => a.id) },
            },
            include: { entry: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
        : [];
    const holdAccounts = holds.length ? await this.prisma.ledgerAccount.findMany({ where: { id: { in: holds.map((h) => h.accountId) } } }) : [];

    const rows = [
      ...holds.map((h) => {
        const a = holdAccounts.find((x) => x.id === h.accountId)!;
        return this.row(h.entry, a, new Decimal(h.amount.toString()).negated(), null, `hold:${h.id}`);
      }),
      ...postings.map((p) => this.row(p.entry, p.account, new Decimal(p.amount.toString()), p.balanceAfter?.toString() ?? null, p.id)),
    ];
    return { items: rows, total: total + (page === 1 ? holds.length : 0), page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), adminView: !!opts.adminView };
  }

  private row(
    e: { id: string; reference: string; type: string; status: string; description: string; counterpartyName: string | null; category: string | null; valueDate: Date; createdAt: Date },
    a: { id: string; name: string; currency: string; accountNumber: string | null; type: string },
    amount: Decimal,
    balanceAfter: string | null,
    rowId: string,
  ) {
    return {
      rowId,
      id: e.id,
      reference: e.reference,
      type: e.type,
      status: e.status,
      description: e.description,
      counterparty: e.counterpartyName,
      category: e.category,
      amount: amount.toFixed(2),
      currency: a.currency,
      accountId: a.id,
      accountName: a.name,
      accountType: a.type,
      accountNumber: a.accountNumber,
      balanceAfter: balanceAfter ? new Decimal(balanceAfter).toFixed(2) : null,
      valueDate: e.valueDate,
      createdAt: e.createdAt,
    };
  }

  async transaction(userId: string | null, entryId: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: {
        postings: { include: { account: true } },
        holds: true,
        transfer: true,
        billPayment: { include: { provider: true } },
        cardTransaction: { include: { card: true } },
        reversalOf: true,
        reversedBy: true,
      },
    });
    if (!entry) throw notFound('Transaction');
    let mine = entry.postings.filter((p) => !userId || p.account.ownerId === userId);
    const holdAccts = entry.holds.length ? await this.prisma.ledgerAccount.findMany({ where: { id: { in: entry.holds.map((h) => h.accountId) } } }) : [];
    const myHolds = entry.holds.filter((h) => !userId || holdAccts.find((a) => a.id === h.accountId)?.ownerId === userId);
    if (userId && !mine.length && !myHolds.length && entry.transfer?.userId !== userId) throw notFound('Transaction');
    if (!userId) mine = entry.postings;

    const legs = mine.map((p) => ({
      accountId: p.accountId,
      accountName: p.account.name,
      accountNumber: p.account.accountNumber,
      accountType: p.account.type,
      systemCode: p.account.systemCode,
      amount: new Decimal(p.amount.toString()).toFixed(2),
      currency: p.currency,
      balanceAfter: p.balanceAfter ? new Decimal(p.balanceAfter.toString()).toFixed(2) : null,
    }));
    const pendingLegs = myHolds.map((h) => {
      const a = holdAccts.find((x) => x.id === h.accountId)!;
      return { accountId: a.id, accountName: a.name, accountNumber: a.accountNumber, amount: new Decimal(h.amount.toString()).negated().toFixed(2), currency: a.currency, released: !!h.releasedAt };
    });
    const { metadata, idempotencyKey: _k, ...rest } = entry;
    const meta = { ...((metadata as Record<string, unknown>) ?? {}) };
    delete meta.pendingLegs;
    return {
      ...rest,
      metadata: meta,
      legs,
      pendingLegs,
      transfer: entry.transfer ? { ...entry.transfer, amount: entry.transfer.amount.toFixed(2), fee: entry.transfer.fee.toFixed(2) } : null,
      billPayment: entry.billPayment ? { ...entry.billPayment, amount: entry.billPayment.amount.toFixed(2) } : null,
      cardTransaction: entry.cardTransaction
        ? { merchant: entry.cardTransaction.merchant, category: entry.cardTransaction.category, last4: entry.cardTransaction.card.last4, brand: entry.cardTransaction.card.brand }
        : null,
      reversalOf: entry.reversalOf ? { id: entry.reversalOf.id, reference: entry.reversalOf.reference } : null,
      reversedBy: entry.reversedBy ? { id: entry.reversedBy.id, reference: entry.reversedBy.reference } : null,
    };
  }

  /** Internal recipient lookup by account number or @tag. */
  async lookup(recipient: string) {
    const r = recipient.trim();
    if (r.startsWith('@')) {
      const u = await this.prisma.user.findUnique({ where: { tag: r.slice(1).toLowerCase() } });
      if (!u || u.status === 'CLOSED') throw notFound('Recipient');
      const accts = await this.prisma.ledgerAccount.findMany({ where: { ownerId: u.id, type: 'CUSTOMER_WALLET', status: 'ACTIVE' }, orderBy: { isPrimary: 'desc' } });
      if (!accts.length) throw notFound('Recipient account');
      return { name: `${u.firstName} ${u.lastName}`, accountNumber: accts[0].accountNumber!, currency: accts[0].currency, accountId: accts[0].id, userId: u.id, currencies: accts.map((a) => a.currency) };
    }
    const acct = await this.prisma.ledgerAccount.findUnique({ where: { accountNumber: r }, include: { owner: true } });
    if (!acct || !acct.owner || acct.type !== 'CUSTOMER_WALLET' || acct.status === 'CLOSED') throw notFound('Recipient account');
    return { name: `${acct.owner.firstName} ${acct.owner.lastName}`, accountNumber: acct.accountNumber!, currency: acct.currency, accountId: acct.id, userId: acct.owner.id, currencies: [acct.currency] };
  }
}
