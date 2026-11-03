import { Injectable } from '@nestjs/common';
import type { AdminUser, EntryType, UserStatus } from '@prisma/client';
import { formatMoney, toMoney } from '@onebank/shared';
import Decimal from 'decimal.js';
import { AppError, notFound } from '../../common/app-error';
import { generateReference } from '../../common/crypto';
import { PrismaService } from '../../common/infra';
import { SessionService } from '../auth/session.service';
import { AccountsService } from '../banking/accounts.service';
import { AuditService } from '../core/audit.service';
import { FxService } from '../core/fx.service';
import { LedgerService } from '../core/ledger.service';
import { NotificationsService } from '../core/notifications.service';
import { SettingsService } from '../core/settings.service';

const STATUS_COPY: Record<string, { subject: string; message: string; tone: string }> = {
  SUSPENDED: { subject: 'Your account has been suspended', message: 'Outgoing transactions on your One Bank account are temporarily disabled. You can still sign in and view your account.', tone: 'alert' },
  BLOCKED: { subject: 'Your account has been blocked', message: 'Access to your One Bank account has been blocked and all devices were signed out.', tone: 'alert' },
  ACTIVE: { subject: 'Your account has been reinstated', message: 'Your One Bank account is fully active again. Thank you for your patience.', tone: 'success' },
  CLOSED: { subject: 'Your account has been closed', message: 'Your One Bank account has been closed.', tone: 'alert' },
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly accounts: AccountsService,
    private readonly fx: FxService,
    private readonly settings: SettingsService,
  ) {}

  actor(a: AdminUser, ip?: string) {
    return { type: 'ADMIN' as const, id: a.id, email: a.email, ip };
  }

  // ---------- users ----------

  async setUserStatus(admin: AdminUser, userId: string, status: UserStatus, reason: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound('User');
    if (user.status === status) throw new AppError('CONFLICT', `User is already ${status.toLowerCase()}`);
    if (status === 'ACTIVE' && !user.emailVerifiedAt) throw new AppError('CONFLICT', 'User has not verified their email yet.');
    await this.prisma.user.update({ where: { id: userId }, data: { status, statusReason: status === 'ACTIVE' ? null : reason } });
    if (status === 'BLOCKED' || status === 'CLOSED') await this.sessions.revokeWhere({ userId }, `Account ${status.toLowerCase()} by admin`);
    await this.audit.log(this.actor(admin), `user.status.${status.toLowerCase()}`, { type: 'User', id: userId }, { reason, before: { status: user.status }, after: { status } });
    const copy = STATUS_COPY[status];
    await this.notifications.notify(userId, {
      category: 'SECURITY',
      type: `ACCOUNT_${status}`,
      title: copy.subject,
      body: status === 'ACTIVE' ? copy.message : `${copy.message} Reason: ${reason}`,
      link: '/app/support',
      email: { template: 'account-status', data: { subject: copy.subject, message: copy.message, reason: status === 'ACTIVE' ? undefined : reason, tone: copy.tone } },
    });
  }

  async setAccountStatus(admin: AdminUser, accountId: string, status: 'ACTIVE' | 'FROZEN', reason: string) {
    const acct = await this.prisma.ledgerAccount.findUnique({ where: { id: accountId } });
    if (!acct || !acct.ownerId) throw notFound('Account');
    await this.prisma.ledgerAccount.update({ where: { id: accountId }, data: { status, statusReason: status === 'FROZEN' ? reason : null } });
    await this.audit.log(this.actor(admin), status === 'FROZEN' ? 'account.freeze' : 'account.unfreeze', { type: 'LedgerAccount', id: accountId }, { reason, before: { status: acct.status }, after: { status } });
    await this.notifications.notify(acct.ownerId, {
      category: 'SECURITY',
      type: status === 'FROZEN' ? 'ACCOUNT_FROZEN' : 'ACCOUNT_UNFROZEN',
      title: status === 'FROZEN' ? `${acct.name} frozen` : `${acct.name} unfrozen`,
      body: status === 'FROZEN' ? `Debits are disabled on ${acct.accountNumber ?? acct.name}. Reason: ${reason}` : `${acct.accountNumber ?? acct.name} is active again.`,
      link: '/app/accounts',
    });
  }

  async setCardStatus(admin: AdminUser, cardId: string, action: 'freeze' | 'unfreeze' | 'terminate', reason: string) {
    const card = await this.prisma.virtualCard.findUnique({ where: { id: cardId } });
    if (!card) throw notFound('Card');
    if (action === 'terminate') {
      const acct = await this.prisma.ledgerAccount.findUniqueOrThrow({ where: { id: card.accountId } });
      const wallet = await this.prisma.ledgerAccount.findFirst({ where: { ownerId: card.userId, type: 'CUSTOMER_WALLET', currency: card.currency, status: { not: 'CLOSED' } } });
      await this.ledger.run(async (tx) => {
        const bal = new Decimal(acct.balance.toString());
        if (bal.gt(0) && wallet) {
          await this.ledger.post(tx, {
            type: 'CARD_WITHDRAWAL',
            description: `Card terminated by One Bank — balance returned •••• ${card.last4}`,
            legs: [
              { accountId: acct.id, amount: bal.negated() },
              { accountId: wallet.id, amount: bal },
            ],
            initiatorType: 'ADMIN',
            initiatorId: admin.id,
          });
        }
        await tx.ledgerAccount.update({ where: { id: acct.id }, data: { status: 'CLOSED' } });
        await tx.virtualCard.update({ where: { id: card.id }, data: { status: 'TERMINATED', statusReason: `ADMIN: ${reason}` } });
      });
    } else {
      await this.prisma.virtualCard.update({ where: { id: cardId }, data: { status: action === 'freeze' ? 'FROZEN' : 'ACTIVE', statusReason: action === 'freeze' ? `ADMIN: ${reason}` : null } });
    }
    await this.audit.log(this.actor(admin), `card.${action}`, { type: 'VirtualCard', id: cardId }, { reason });
    await this.notifications.notify(card.userId, {
      category: 'SECURITY',
      type: `CARD_${action.toUpperCase()}`,
      title: `Card •••• ${card.last4} ${action === 'freeze' ? 'frozen' : action === 'unfreeze' ? 'unfrozen' : 'terminated'} by One Bank`,
      body: action === 'unfreeze' ? 'Your card is active again.' : `Reason: ${reason}`,
      link: '/app/cards',
      email: { template: 'card-event', data: { subject: `Card •••• ${card.last4} ${action === 'unfreeze' ? 'reactivated' : action === 'freeze' ? 'frozen' : 'terminated'}`, message: action === 'unfreeze' ? 'Your card is active again.' : `Reason: ${reason}`, tone: action === 'unfreeze' ? 'success' : 'alert' } },
    });
  }

  // ---------- ledger operations ----------

  /** Credit/debit a customer account against BANK_EQUITY. */
  async adjust(
    admin: AdminUser,
    input: { accountId: string; direction: 'CREDIT' | 'DEBIT'; amount: number; kind: string; description: string; reason: string; valueDate?: Date; notifyUser: boolean },
  ) {
    const acct = await this.prisma.ledgerAccount.findUnique({ where: { id: input.accountId } });
    if (!acct || !acct.ownerId) throw notFound('Account');
    const amount = toMoney(input.amount);
    const equity = await this.ledger.systemAccountId('BANK_EQUITY', acct.currency);
    const credit = input.direction === 'CREDIT';
    const entry = await this.ledger.run((tx) =>
      this.ledger.post(tx, {
        type: credit ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT',
        description: input.description,
        category: input.kind === 'BONUS' ? 'Income' : input.kind === 'FEE' ? 'Fees' : input.kind === 'REFUND' ? 'Refunds' : 'Adjustments',
        legs: [
          { accountId: equity, amount: credit ? amount.negated() : amount },
          { accountId: acct.id, amount: credit ? amount : amount.negated() },
        ],
        initiatorType: 'ADMIN',
        initiatorId: admin.id,
        valueDate: input.valueDate,
        counterpartyName: 'One Bank',
        metadata: { kind: input.kind, reason: input.reason, adminEmail: admin.email },
      }),
    );
    await this.audit.log(this.actor(admin), `ledger.${credit ? 'credit' : 'debit'}`, { type: 'JournalEntry', id: entry.id }, { reason: input.reason, after: { accountId: acct.id, amount: amount.toFixed(2), currency: acct.currency, kind: input.kind } });
    if (input.notifyUser) {
      if (credit) await this.accounts.creditNotice(acct.ownerId, acct.id, entry.id);
      else await this.accounts.debitNotice(acct.ownerId, acct.id, entry.id, { to: 'One Bank', amount });
    } else await this.notifications.balanceChanged(acct.ownerId);
    return entry;
  }

  /**
   * Add a realistic-looking transaction to a customer's history (e.g. "Incoming wire from ACME").
   * Still posts a balanced entry against BANK_EQUITY (or a pending hold for PENDING debits).
   */
  async customTransaction(
    admin: AdminUser,
    input: {
      accountId: string;
      direction: 'CREDIT' | 'DEBIT';
      type: string;
      amount: number;
      counterpartyName: string;
      counterpartyAccount: string;
      counterpartyBank: string;
      description: string;
      reference?: string;
      valueDate?: Date;
      status: 'COMPLETED' | 'PENDING';
      reason: string;
      notifyUser: boolean;
    },
  ) {
    const acct = await this.prisma.ledgerAccount.findUnique({ where: { id: input.accountId } });
    if (!acct || !acct.ownerId) throw notFound('Account');
    if (input.reference && (await this.prisma.journalEntry.findUnique({ where: { reference: input.reference } }))) throw new AppError('CONFLICT', 'That reference is already used.');
    if (input.status === 'PENDING' && input.direction === 'CREDIT') throw new AppError('VALIDATION', 'Pending entries are only supported for debits (funds on hold).');
    const amount = toMoney(input.amount);
    const credit = input.direction === 'CREDIT';
    const equity = await this.ledger.systemAccountId('BANK_EQUITY', acct.currency);
    const entry = await this.ledger.run((tx) =>
      this.ledger.post(tx, {
        type: input.type as EntryType,
        status: input.status,
        reference: input.reference || generateReference(),
        description: input.description,
        category: credit ? 'Income' : 'Transfers',
        legs: [
          { accountId: equity, amount: credit ? amount.negated() : amount },
          { accountId: acct.id, amount: credit ? amount : amount.negated() },
        ],
        initiatorType: 'ADMIN',
        initiatorId: admin.id,
        valueDate: input.valueDate,
        counterpartyName: input.counterpartyName,
        counterpartyAccount: input.counterpartyAccount || undefined,
        counterpartyBank: input.counterpartyBank || undefined,
        metadata: { adminCustom: true, reason: input.reason, adminEmail: admin.email },
        allowNegative: [],
      }),
    );
    await this.audit.log(this.actor(admin), 'ledger.custom_transaction', { type: 'JournalEntry', id: entry.id }, { reason: input.reason, after: { ...input, amount: amount.toFixed(2), currency: acct.currency } });
    if (input.notifyUser && input.status === 'COMPLETED') {
      if (credit) await this.accounts.creditNotice(acct.ownerId, acct.id, entry.id);
      else await this.accounts.debitNotice(acct.ownerId, acct.id, entry.id, { to: input.counterpartyName, amount });
    } else await this.notifications.balanceChanged(acct.ownerId);
    return entry;
  }

  async settlePending(admin: AdminUser, entryId: string, action: 'settle' | 'fail', reason: string) {
    const entry = await this.prisma.journalEntry.findUnique({ where: { id: entryId }, include: { transfer: true } });
    if (!entry) throw notFound('Transaction');
    if (entry.status !== 'PENDING') throw new AppError('CONFLICT', 'Transaction is not pending');
    if (entry.transfer) throw new AppError('CONFLICT', 'Use the transfer review actions for transfers.');
    await this.ledger.run((tx) => (action === 'settle' ? this.ledger.settle(tx, entryId) : this.ledger.fail(tx, entryId, reason)));
    await this.audit.log(this.actor(admin), `ledger.pending_${action}`, { type: 'JournalEntry', id: entryId }, { reason });
  }

  async reverse(admin: AdminUser, entryId: string, reason: string, force: boolean) {
    const entry = await this.prisma.journalEntry.findUnique({ where: { id: entryId }, include: { postings: { include: { account: true } }, transfer: true } });
    if (!entry) throw notFound('Transaction');
    const result = await this.ledger.run((tx) => this.ledger.reverse(tx, entryId, { reason, initiatorType: 'ADMIN', initiatorId: admin.id, force }));
    if (entry.transfer) {
      const timeline = [...((entry.transfer.timeline as object[]) ?? []), { status: 'REVERSED', at: new Date().toISOString(), note: reason }];
      await this.prisma.transfer.update({ where: { id: entry.transfer.id }, data: { status: 'REVERSED', timeline } });
    }
    await this.audit.log(this.actor(admin), 'ledger.reverse', { type: 'JournalEntry', id: entryId }, { reason, after: { reversalId: result.reversal?.id, force } });
    const owners = new Set(entry.postings.map((p) => p.account.ownerId).filter(Boolean) as string[]);
    for (const ownerId of owners) {
      const p = entry.postings.find((x) => x.account.ownerId === ownerId)!;
      await this.notifications.notify(ownerId, {
        category: 'TRANSACTIONS',
        type: 'REVERSED',
        title: 'Transaction reversed',
        body: `${entry.reference} (${formatMoney(new Decimal(p.amount.toString()).abs(), p.currency)}) was reversed.`,
        link: `/app/transactions/${result.reversal?.id ?? entryId}`,
        email: { template: 'transaction-reversed', data: { reference: entry.reference, amount: formatMoney(new Decimal(p.amount.toString()).abs(), p.currency), reason } },
      });
      await this.notifications.balanceChanged(ownerId);
    }
    return result;
  }

  // ---------- KYC ----------

  async reviewKyc(admin: AdminUser, id: string, approve: boolean, note: string) {
    const sub = await this.prisma.kycSubmission.findUnique({ where: { id }, include: { user: true } });
    if (!sub) throw notFound('Submission');
    if (sub.status !== 'PENDING') throw new AppError('CONFLICT', 'Already reviewed');
    await this.prisma.kycSubmission.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', reviewedById: admin.id, reviewNote: note, reviewedAt: new Date() } });
    if (approve) await this.prisma.user.update({ where: { id: sub.userId }, data: { kycLevel: Math.max(sub.user.kycLevel, sub.level) } });
    await this.audit.log(this.actor(admin), approve ? 'kyc.approve' : 'kyc.reject', { type: 'User', id: sub.userId }, { reason: note, after: { level: sub.level } });
    await this.notifications.notify(sub.userId, {
      category: 'ACCOUNT',
      type: approve ? 'KYC_APPROVED' : 'KYC_REJECTED',
      title: approve ? `Verified — level ${sub.level} unlocked` : 'Verification needs attention',
      body: approve ? 'Your new limits are now active.' : note,
      link: approve ? '/app/settings/limits' : '/app/settings/kyc',
      email: { template: 'kyc-result', data: { approved: approve, level: sub.level, note } },
    });
    if (approve && sub.level >= 2) await this.payReferralBonus(sub.userId);
  }

  /** Referral bonus is paid to the referrer once the referee reaches KYC level 2. */
  async payReferralBonus(refereeId: string) {
    const ref = await this.prisma.referral.findUnique({ where: { refereeId } });
    if (!ref || ref.bonusPaid) return;
    const wallet = await this.prisma.ledgerAccount.findFirst({ where: { ownerId: ref.referrerId, type: 'CUSTOMER_WALLET', isPrimary: true, status: 'ACTIVE' } });
    if (!wallet) return;
    const s = await this.settings.get();
    const amount = await this.fx.fromUsd(s.referralBonusUsd, wallet.currency);
    const entry = await this.ledger.run(async (tx) =>
      this.ledger.post(tx, {
        type: 'REFERRAL_BONUS',
        description: 'Referral bonus — thanks for inviting a friend',
        category: 'Income',
        legs: [
          { accountId: await this.ledger.systemAccountId('BANK_EQUITY', wallet.currency), amount: amount.negated() },
          { accountId: wallet.id, amount },
        ],
        initiatorType: 'SYSTEM',
        counterpartyName: 'One Bank Rewards',
        idempotencyKey: `referral:${ref.id}`,
      }),
    );
    await this.prisma.referral.update({ where: { id: ref.id }, data: { bonusPaid: true } });
    await this.accounts.creditNotice(ref.referrerId, wallet.id, entry.id);
  }

  // ---------- analytics ----------

  async overview() {
    const now = new Date();
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    const week = new Date(now.getTime() - 7 * 86_400_000);
    const month = new Date(now.getTime() - 30 * 86_400_000);
    const [users, newToday, newWeek, statusGroups, kycGroups, activeSessions, pendingKyc, openTickets, reviewQueue, openFlags, loansOutstanding, pendingLoans] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: day } } }),
      this.prisma.user.count({ where: { createdAt: { gte: week } } }),
      this.prisma.user.groupBy({ by: ['status'], _count: true }),
      this.prisma.user.groupBy({ by: ['kycLevel'], _count: true }),
      this.prisma.session.count({ where: { userId: { not: null }, revokedAt: null, expiresAt: { gt: now }, lastSeenAt: { gte: new Date(now.getTime() - 30 * 60_000) } } }),
      this.prisma.kycSubmission.count({ where: { status: 'PENDING' } }),
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'PENDING'] } } }),
      this.prisma.transfer.count({ where: { status: 'AWAITING_REVIEW' } }),
      this.prisma.fraudFlag.count({ where: { status: 'OPEN' } }),
      this.prisma.loan.findMany({ where: { status: { in: ['DISBURSED', 'DEFAULTED'] } }, select: { totalRepayable: true, amountRepaid: true, currency: true } }),
      this.prisma.loan.count({ where: { status: 'APPLIED' } }),
    ]);

    const deposits = await this.prisma.$queryRaw<{ currency: string; total: string }[]>`
      SELECT currency, COALESCE(SUM(balance),0)::text AS total FROM "LedgerAccount" WHERE "ownerId" IS NOT NULL AND type <> 'LOAN' GROUP BY currency ORDER BY currency`;
    const volume = async (since: Date) => {
      const rows = await this.prisma.$queryRaw<{ currency: string; total: string; count: bigint }[]>`
        SELECT a.currency, COALESCE(SUM(ABS(p.amount)),0)::text AS total, COUNT(DISTINCT p."entryId") AS count
        FROM "Posting" p JOIN "LedgerAccount" a ON a.id = p."accountId"
        WHERE a."ownerId" IS NOT NULL AND p."createdAt" >= ${since} GROUP BY a.currency`;
      let usd = new Decimal(0);
      let count = 0;
      for (const r of rows) {
        usd = usd.plus(await this.fx.toUsd(r.total, r.currency));
        count += Number(r.count);
      }
      return { usd: usd.toFixed(2), count };
    };
    const fees = await this.prisma.$queryRaw<{ currency: string; total: string }[]>`
      SELECT a.currency, COALESCE(SUM(p.amount),0)::text AS total FROM "Posting" p JOIN "LedgerAccount" a ON a.id = p."accountId"
      WHERE a."systemCode" = 'FEES' AND p."createdAt" >= ${month} GROUP BY a.currency`;
    let feesUsd = new Decimal(0);
    for (const f of fees) feesUsd = feesUsd.plus(await this.fx.toUsd(f.total, f.currency));
    let depositsUsd = new Decimal(0);
    for (const d of deposits) depositsUsd = depositsUsd.plus(await this.fx.toUsd(d.total, d.currency));
    let loanUsd = new Decimal(0);
    for (const l of loansOutstanding) loanUsd = loanUsd.plus(await this.fx.toUsd(new Decimal(l.totalRepayable.toString()).minus(l.amountRepaid.toString()), l.currency));

    // Time series (last 30 days)
    const signups = await this.prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, COUNT(*) AS count FROM "User" WHERE "createdAt" >= ${month} GROUP BY 1 ORDER BY 1`;
    const flows = await this.prisma.$queryRaw<{ day: string; currency: string; inflow: string; outflow: string }[]>`
      SELECT to_char(date_trunc('day', p."createdAt"), 'YYYY-MM-DD') AS day, a.currency,
        COALESCE(SUM(CASE WHEN p.amount > 0 THEN p.amount ELSE 0 END),0)::text AS inflow,
        COALESCE(SUM(CASE WHEN p.amount < 0 THEN -p.amount ELSE 0 END),0)::text AS outflow
      FROM "Posting" p JOIN "LedgerAccount" a ON a.id = p."accountId"
      WHERE a.type = 'CUSTOMER_WALLET' AND p."createdAt" >= ${month} GROUP BY 1, 2 ORDER BY 1`;
    const byType = await this.prisma.$queryRaw<{ type: string; currency: string; total: string; count: bigint }[]>`
      SELECT e.type::text AS type, a.currency, COALESCE(SUM(ABS(p.amount)),0)::text AS total, COUNT(DISTINCT e.id) AS count
      FROM "Posting" p JOIN "LedgerAccount" a ON a.id = p."accountId" JOIN "JournalEntry" e ON e.id = p."entryId"
      WHERE a."ownerId" IS NOT NULL AND p."createdAt" >= ${month} AND p.amount < 0 GROUP BY 1, 2`;
    const devices = await this.prisma.$queryRaw<{ label: string; count: bigint }[]>`
      SELECT COALESCE(NULLIF(split_part(browser, ' ', 1), ''), 'Unknown') AS label, COUNT(*) AS count FROM "LoginEvent" WHERE success = true AND "createdAt" >= ${month} GROUP BY 1 ORDER BY 2 DESC LIMIT 6`;
    const countries = await this.prisma.$queryRaw<{ label: string; count: bigint }[]>`
      SELECT country AS label, COUNT(*) AS count FROM "User" GROUP BY 1 ORDER BY 2 DESC LIMIT 6`;

    const days: string[] = [];
    for (let i = 29; i >= 0; i--) days.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10));
    const flowMap = new Map(days.map((d) => [d, { day: d, inflow: new Decimal(0), outflow: new Decimal(0) }]));
    for (const f of flows) {
      const m = flowMap.get(f.day);
      if (!m) continue;
      m.inflow = m.inflow.plus(await this.fx.toUsd(f.inflow, f.currency));
      m.outflow = m.outflow.plus(await this.fx.toUsd(f.outflow, f.currency));
    }
    const typeMap = new Map<string, { total: Decimal; count: number }>();
    for (const t of byType) {
      const cur = typeMap.get(t.type) ?? { total: new Decimal(0), count: 0 };
      typeMap.set(t.type, { total: cur.total.plus(await this.fx.toUsd(t.total, t.currency)), count: cur.count + Number(t.count) });
    }

    return {
      kpis: {
        users,
        newToday,
        newWeek,
        activeSessions,
        depositsUsd: depositsUsd.toFixed(2),
        volumeToday: await volume(day),
        volumeWeek: await volume(week),
        volumeMonth: await volume(month),
        feesMonthUsd: feesUsd.toFixed(2),
        pendingKyc,
        openTickets,
        reviewQueue,
        openFlags,
        pendingLoans,
        loansOutstandingUsd: loanUsd.toFixed(2),
      },
      deposits: deposits.map((d) => ({ currency: d.currency, total: new Decimal(d.total).toFixed(2) })),
      statuses: statusGroups.map((s) => ({ label: s.status, count: s._count })),
      kycLevels: kycGroups.map((k) => ({ label: `Level ${k.kycLevel}`, count: k._count })),
      signups: days.map((d) => ({ day: d, count: Number(signups.find((s) => s.day === d)?.count ?? 0) })),
      flows: [...flowMap.values()].map((f) => ({ day: f.day, inflow: f.inflow.toFixed(2), outflow: f.outflow.toFixed(2) })),
      byType: [...typeMap.entries()].map(([type, v]) => ({ type, totalUsd: v.total.toFixed(2), count: v.count })).sort((a, b) => Number(b.totalUsd) - Number(a.totalUsd)),
      devices: devices.map((d) => ({ label: d.label, count: Number(d.count) })),
      countries: countries.map((c) => ({ label: c.label, count: Number(c.count) })),
    };
  }

  async activity() {
    const [signups, entries, failedLogins, flags] = await Promise.all([
      this.prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, firstName: true, lastName: true, email: true, createdAt: true, country: true } }),
      this.prisma.journalEntry.findMany({ where: { initiatorType: { not: 'SYSTEM' } }, orderBy: { createdAt: 'desc' }, take: 12, include: { postings: { include: { account: true } } } }),
      this.prisma.loginEvent.findMany({ where: { success: false }, orderBy: { createdAt: 'desc' }, take: 8 }),
      this.prisma.fraudFlag.findMany({ where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 8, include: { user: { select: { firstName: true, lastName: true } } } }),
    ]);
    type Item = { kind: string; at: Date; title: string; detail: string; link?: string };
    const items: Item[] = [
      ...signups.map((u) => ({ kind: 'signup', at: u.createdAt, title: `${u.firstName} ${u.lastName} signed up`, detail: `${u.email} · ${u.country}`, link: `/users/${u.id}` })),
      ...entries.map((e) => {
        const p = e.postings.find((x) => x.account.ownerId) ?? e.postings[0];
        return { kind: 'transaction', at: e.createdAt, title: `${e.type.replace(/_/g, ' ').toLowerCase()} · ${p ? formatMoney(new Decimal(p.amount.toString()).abs(), p.currency) : ''}`, detail: e.description, link: `/transactions/${e.id}` };
      }),
      ...failedLogins.map((l) => ({ kind: 'failed_login', at: l.createdAt, title: `Failed sign-in (${l.reason ?? 'unknown'})`, detail: `${l.email} · ${l.ip}` })),
      ...flags.map((f) => ({ kind: 'fraud', at: f.createdAt, title: `Fraud flag: ${f.rule}`, detail: `${f.user.firstName} ${f.user.lastName} · ${f.details}`, link: '/risk' })),
    ];
    return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 30);
  }
}
