import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Prisma, Transfer, User } from '@prisma/client';
import { calculateFee, convert, formatMoney, toMoney } from '@onebank/shared';
import { createHash } from 'crypto';
import Decimal from 'decimal.js';
import { config } from '../../config';
import { AppError, notFound } from '../../common/app-error';
import { PrismaService } from '../../common/infra';
import { AuditService } from '../core/audit.service';
import { FxService } from '../core/fx.service';
import { LedgerService, type Leg } from '../core/ledger.service';
import { MoneyGuardService } from '../core/money-guard.service';
import { NotificationsService } from '../core/notifications.service';
import { QueueService } from '../core/queue.service';
import { SettingsService } from '../core/settings.service';
import { AccountsService } from './accounts.service';
import { FraudService } from './fraud.service';

interface Common {
  fromAccountId: string;
  amount: number;
  pin: string;
  otp?: string;
  idempotencyKey: string;
  saveBeneficiary?: boolean;
  scheduledFor?: Date;
  frequency?: 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
}
export interface InternalInput extends Common {
  recipient: string;
  narration?: string;
}
export interface InterbankInput extends Common {
  bankCode: string;
  accountNumber: string;
  accountName: string;
  narration?: string;
}
export interface WireInput extends Common {
  beneficiaryName: string;
  beneficiaryAddress: string;
  country: string;
  bankName: string;
  swiftCode: string;
  iban: string;
  purpose: string;
}

type TimelineItem = { status: string; at: string; note?: string };

const FIRST = ['James', 'Amara', 'Olivia', 'Chinedu', 'Sophia', 'Liam', 'Ngozi', 'Ethan', 'Isabella', 'Tunde', 'Mia', 'Noah', 'Aisha', 'Lucas', 'Emeka', 'Grace'];
const LAST = ['Anderson', 'Okafor', 'Williams', 'Adeyemi', 'Brown', 'Martins', 'Johnson', 'Eze', 'Garcia', 'Bello', 'Miller', 'Nwosu', 'Davis', 'Clarke'];

@Injectable()
export class TransfersService implements OnModuleInit {
  private readonly logger = new Logger('Transfers');

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly guard: MoneyGuardService,
    private readonly fx: FxService,
    private readonly settings: SettingsService,
    private readonly accounts: AccountsService,
    private readonly fraud: FraudService,
    private readonly notifications: NotificationsService,
    private readonly queues: QueueService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    this.queues.process('settlement', async (job) => this.advance(job.data.transferId));
  }

  // ---------- lookups ----------

  banks(country?: string) {
    return this.prisma.bank.findMany({ where: { active: true, ...(country ? { country } : {}) }, orderBy: { name: 'asc' } });
  }

  /** Simulated name enquiry: deterministic name per (bank, account). */
  async nameEnquiry(bankCode: string, accountNumber: string) {
    const bank = await this.prisma.bank.findUnique({ where: { code: bankCode } });
    if (!bank || !bank.active) throw notFound('Bank');
    if (!/^\d{6,12}$/.test(accountNumber)) throw new AppError('VALIDATION', 'Enter a valid account number.');
    const h = createHash('sha256').update(`${bankCode}:${accountNumber}`).digest();
    return { accountName: `${FIRST[h[0] % FIRST.length]} ${LAST[h[1] % LAST.length]}`, bankName: bank.name, accountNumber };
  }

  // ---------- internal ----------

  async internal(user: User, input: InternalInput, ctx: { sessionId?: string; scheduled?: boolean } = {}) {
    await this.settings.assertFeature('internalTransfers');
    const key = `${user.id}:${input.idempotencyKey}`;
    const prior = await this.ledger.findByIdempotencyKey(key);
    if (prior) return prior;

    const from = await this.guard.ownedAccount(user.id, input.fromAccountId);
    const to = await this.accounts.lookup(input.recipient);
    if (to.accountId === from.id) throw new AppError('VALIDATION', 'You cannot send money to the same account.');
    if (await this.maybeSchedule(user, 'INTERNAL', input, from.currency, to.name)) return { scheduled: true };

    const amount = toMoney(input.amount);
    const amountUsd = ctx.scheduled
      ? await this.fx.toUsd(amount, from.currency)
      : await this.guard.authorize(user, { amount, currency: from.currency, pin: input.pin, otp: input.otp });
    if (ctx.scheduled) this.guard.assertUserCanTransact(user);

    const legs: Leg[] = [];
    let credited = amount;
    let fxMeta: Record<string, string> | undefined;
    if (to.currency === from.currency) {
      legs.push({ accountId: from.id, amount: amount.negated() }, { accountId: to.accountId, amount });
    } else {
      const mid = await this.fx.midRate(from.currency, to.currency);
      const { rate, converted } = convert(amount, mid, await this.fx.spread(from.currency, to.currency));
      credited = converted;
      fxMeta = { rate: rate.toString(), from: from.currency, to: to.currency, converted: converted.toFixed(2) };
      legs.push(
        { accountId: from.id, amount: amount.negated() },
        { accountId: await this.ledger.systemAccountId('FX_POOL', from.currency), amount },
        { accountId: await this.ledger.systemAccountId('FX_POOL', to.currency), amount: converted.negated() },
        { accountId: to.accountId, amount: converted },
      );
    }
    const sender = `${user.firstName} ${user.lastName}`;
    const own = to.userId === user.id;
    const { entry } = await this.ledger.run(async (tx) => {
      const entry = await this.ledger.post(tx, {
        type: 'INTERNAL_TRANSFER',
        description: input.narration || (own ? 'Transfer between my accounts' : `Transfer to ${to.name}`),
        category: own ? 'Transfers' : 'Transfers',
        legs,
        idempotencyKey: key,
        counterpartyName: to.name,
        counterpartyAccount: to.accountNumber,
        counterpartyBank: 'One Bank',
        initiatorId: user.id,
        metadata: { senderName: sender, senderAccount: from.accountNumber, ...(fxMeta ? { fx: fxMeta } : {}), scheduled: !!ctx.scheduled },
      });
      await tx.transfer.create({
        data: {
          userId: user.id,
          entryId: entry.id,
          kind: 'INTERNAL',
          fromAccountId: from.id,
          toAccountId: to.accountId,
          amount: amount.toFixed(4),
          currency: from.currency,
          recipientName: to.name,
          recipientAccount: to.accountNumber,
          recipientBankName: 'One Bank',
          narration: input.narration,
          status: 'COMPLETED',
          completedAt: new Date(),
          timeline: [{ status: 'COMPLETED', at: new Date().toISOString(), note: 'Instant transfer' }],
        },
      });
      return { entry };
    });

    if (input.saveBeneficiary && !own) await this.saveBeneficiary(user.id, { type: 'INTERNAL', name: to.name, accountNumber: to.accountNumber, bankName: 'One Bank' });
    await this.fraud.evaluate({ userId: user.id, sessionId: ctx.sessionId, entryId: entry.id, amountUsd, recipientAccount: to.accountNumber, fromAccountId: from.id });
    await this.accounts.debitNotice(user.id, from.id, entry.id, { to: to.name, amount });
    // Re-label the description from the recipient's perspective in their notification.
    if (!own) {
      await this.accounts.creditNotice(to.userId, to.accountId, entry.id);
    } else {
      await this.notifications.balanceChanged(user.id);
    }
    return { ...entry, credited: credited.toFixed(2) };
  }

  // ---------- interbank / wire ----------

  async interbank(user: User, input: InterbankInput, ctx: { sessionId?: string; scheduled?: boolean } = {}) {
    await this.settings.assertFeature('interbank');
    const key = `${user.id}:${input.idempotencyKey}`;
    const prior = await this.ledger.findByIdempotencyKey(key);
    if (prior) return prior;
    const from = await this.guard.ownedAccount(user.id, input.fromAccountId);
    const bank = await this.prisma.bank.findUnique({ where: { code: input.bankCode } });
    if (!bank || !bank.active) throw notFound('Bank');
    if (await this.maybeSchedule(user, 'INTERBANK', input, from.currency, input.accountName)) return { scheduled: true };

    const amount = toMoney(input.amount);
    const s = await this.settings.get();
    const feeUsd = calculateFee(await this.fx.toUsd(amount, from.currency), s.fees.interbank);
    const fee = await this.fx.fromUsd(feeUsd, from.currency);
    const amountUsd = ctx.scheduled
      ? await this.fx.toUsd(amount.plus(fee), from.currency)
      : await this.guard.authorize(user, { amount: amount.plus(fee), currency: from.currency, pin: input.pin, otp: input.otp });
    if (ctx.scheduled) this.guard.assertUserCanTransact(user);

    return this.createExternal(user, {
      kind: 'INTERBANK',
      key,
      from,
      amount,
      fee,
      amountUsd,
      sessionId: ctx.sessionId,
      description: input.narration || `Transfer to ${input.accountName}`,
      recipient: { name: input.accountName, account: input.accountNumber, bankCode: bank.code, bankName: bank.name },
      transfer: { narration: input.narration },
      saveBeneficiary: input.saveBeneficiary,
    });
  }

  async wire(user: User, input: WireInput, ctx: { sessionId?: string } = {}) {
    await this.settings.assertFeature('wire');
    const key = `${user.id}:${input.idempotencyKey}`;
    const prior = await this.ledger.findByIdempotencyKey(key);
    if (prior) return prior;
    const from = await this.guard.ownedAccount(user.id, input.fromAccountId);
    const amount = toMoney(input.amount);
    const s = await this.settings.get();
    const feeUsd = calculateFee(await this.fx.toUsd(amount, from.currency), s.fees.wire);
    const fee = await this.fx.fromUsd(feeUsd, from.currency);
    const amountUsd = await this.guard.authorize(user, { amount: amount.plus(fee), currency: from.currency, pin: input.pin, otp: input.otp, minKyc: 2 });

    return this.createExternal(user, {
      kind: 'WIRE',
      key,
      from,
      amount,
      fee,
      amountUsd,
      sessionId: ctx.sessionId,
      description: `Wire to ${input.beneficiaryName}`,
      recipient: { name: input.beneficiaryName, account: input.iban, bankName: input.bankName, bankCode: input.swiftCode },
      transfer: { swiftCode: input.swiftCode, iban: input.iban, recipientAddress: input.beneficiaryAddress, recipientCountry: input.country, purpose: input.purpose },
      saveBeneficiary: input.saveBeneficiary,
      beneficiaryExtra: { swiftCode: input.swiftCode, country: input.country, address: input.beneficiaryAddress },
    });
  }

  private async createExternal(
    user: User,
    p: {
      kind: 'INTERBANK' | 'WIRE';
      key: string;
      from: { id: string; currency: string; accountNumber: string | null };
      amount: Decimal;
      fee: Decimal;
      amountUsd: Decimal;
      sessionId?: string;
      description: string;
      recipient: { name: string; account: string; bankCode?: string; bankName: string };
      transfer: Partial<Prisma.TransferCreateInput>;
      saveBeneficiary?: boolean;
      beneficiaryExtra?: { swiftCode?: string; country?: string; address?: string };
    },
  ) {
    const settlement = await this.ledger.systemAccountId('INTERBANK_SETTLEMENT', p.from.currency);
    const legs: Leg[] = [
      { accountId: p.from.id, amount: p.amount.plus(p.fee).negated() },
      { accountId: settlement, amount: p.amount },
    ];
    if (!p.fee.isZero()) legs.push({ accountId: await this.ledger.systemAccountId('FEES', p.from.currency), amount: p.fee });
    const now = new Date().toISOString();

    const { entry, transfer } = await this.ledger.run(async (tx) => {
      const entry = await this.ledger.post(tx, {
        type: p.kind,
        status: 'PENDING',
        description: p.description,
        category: 'Transfers',
        legs,
        idempotencyKey: p.key,
        counterpartyName: p.recipient.name,
        counterpartyAccount: p.recipient.account,
        counterpartyBank: p.recipient.bankName,
        initiatorId: user.id,
        metadata: { fee: p.fee.toFixed(2), senderName: `${user.firstName} ${user.lastName}` },
      });
      const transfer = await tx.transfer.create({
        data: {
          user: { connect: { id: user.id } },
          entry: { connect: { id: entry.id } },
          kind: p.kind,
          fromAccountId: p.from.id,
          amount: p.amount.toFixed(4),
          fee: p.fee.toFixed(4),
          currency: p.from.currency,
          recipientName: p.recipient.name,
          recipientAccount: p.recipient.account,
          recipientBankCode: p.recipient.bankCode,
          recipientBankName: p.recipient.bankName,
          status: 'PENDING',
          timeline: [{ status: 'PENDING', at: now, note: 'Transfer submitted' }],
          ...p.transfer,
        },
      });
      return { entry, transfer };
    });

    if (p.saveBeneficiary) {
      await this.saveBeneficiary(user.id, { type: p.kind, name: p.recipient.name, accountNumber: p.recipient.account, bankCode: p.recipient.bankCode, bankName: p.recipient.bankName, ...p.beneficiaryExtra });
    }
    const hits = await this.fraud.evaluate({ userId: user.id, sessionId: p.sessionId, entryId: entry.id, amountUsd: p.amountUsd, recipientAccount: p.recipient.account, fromAccountId: p.from.id });
    const s = await this.settings.get();
    const needsReview = p.amountUsd.gte(s.reviewThresholdUsd) || hits.some((h) => h.severity === 'HIGH');
    if (needsReview) {
      await this.setStatus(transfer, 'AWAITING_REVIEW', hits.length ? 'Security review' : 'Large transfer review');
      await this.statusNotice(transfer.id);
    } else {
      await this.queues.add('settlement', p.kind, { transferId: transfer.id }, { delay: p.kind === 'WIRE' ? Math.round(config.wireDelayMs / 3) : config.settlementDelayMs, attempts: 3 });
    }
    await this.accounts.debitNotice(user.id, p.from.id, entry.id, { to: p.recipient.name, amount: p.amount, fee: p.fee });
    return { ...entry, transferId: transfer.id, status: needsReview ? 'AWAITING_REVIEW' : 'PENDING', fee: p.fee.toFixed(2) };
  }

  private async setStatus(t: Transfer, status: Transfer['status'], note?: string, extra: Prisma.TransferUpdateInput = {}) {
    const timeline = [...((t.timeline as TimelineItem[]) ?? []), { status, at: new Date().toISOString(), note }];
    return this.prisma.transfer.update({ where: { id: t.id }, data: { status, timeline, ...extra } });
  }

  /** Drive a transfer forward (worker + admin approvals). */
  async advance(transferId: string) {
    const t = await this.prisma.transfer.findUnique({ where: { id: transferId } });
    if (!t) return;
    if (t.status === 'PENDING' && t.kind === 'WIRE') {
      await this.setStatus(t, 'PROCESSING', 'Sent via SWIFT network');
      await this.queues.add('settlement', 'WIRE', { transferId }, { delay: Math.round((config.wireDelayMs * 2) / 3), attempts: 3 });
      return;
    }
    if (t.status !== 'PENDING' && t.status !== 'PROCESSING') return;
    // Simulated beneficiary-bank rejection for demo purposes.
    if (t.recipientAccount.endsWith('0000')) return this.failTransfer(t.id, 'Beneficiary bank rejected the payment: account closed');
    await this.ledger.run((tx) => this.ledger.settle(tx, t.entryId));
    await this.setStatus(t, 'COMPLETED', t.kind === 'WIRE' ? 'Credited by beneficiary bank' : 'Settled', { completedAt: new Date() });
    await this.statusNotice(t.id);
  }

  async failTransfer(transferId: string, reason: string, status: 'FAILED' | 'REJECTED' = 'FAILED', adminId?: string) {
    const t = await this.prisma.transfer.findUniqueOrThrow({ where: { id: transferId } });
    if (!['PENDING', 'PROCESSING', 'AWAITING_REVIEW'].includes(t.status)) throw new AppError('CONFLICT', `Transfer is already ${t.status.toLowerCase()}`);
    await this.ledger.run((tx) => this.ledger.fail(tx, t.entryId, reason));
    await this.setStatus(t, status, reason, { reviewReason: reason, reviewedById: adminId });
    await this.statusNotice(t.id, reason);
  }

  async approveReview(transferId: string, adminId: string, note?: string) {
    const t = await this.prisma.transfer.findUniqueOrThrow({ where: { id: transferId } });
    if (t.status !== 'AWAITING_REVIEW') throw new AppError('CONFLICT', 'Transfer is not awaiting review');
    const updated = await this.setStatus(t, 'PENDING', `Approved by compliance${note ? `: ${note}` : ''}`, { reviewedById: adminId, reviewReason: note });
    await this.prisma.fraudFlag.updateMany({ where: { entryId: t.entryId, status: 'OPEN' }, data: { status: 'DISMISSED', resolvedById: adminId, resolvedAt: new Date() } });
    if (config.disableWorkers) return this.advance(updated.id);
    await this.queues.add('settlement', t.kind, { transferId }, { delay: 2000, attempts: 3 });
  }

  private async statusNotice(transferId: string, reason?: string) {
    const t = await this.prisma.transfer.findUniqueOrThrow({ where: { id: transferId }, include: { entry: true } });
    const amount = formatMoney(t.amount.toString(), t.currency);
    await this.notifications.notify(t.userId, {
      category: 'TRANSACTIONS',
      type: `TRANSFER_${t.status}`,
      title: `Transfer ${t.status.replace('_', ' ').toLowerCase()}`,
      body: `${amount} to ${t.recipientName}`,
      link: `/app/transactions/${t.entryId}`,
      email: { template: 'transfer-status', data: { status: t.status, amount, to: t.recipientName, reference: t.entry.reference, reason, entryId: t.entryId } },
    });
    await this.notifications.balanceChanged(t.userId);
  }

  // ---------- scheduling ----------

  private async maybeSchedule(user: User, kind: 'INTERNAL' | 'INTERBANK', input: Common & { accountName?: string }, currency: string, recipientName: string) {
    const future = input.scheduledFor && input.scheduledFor.getTime() > Date.now() + 60_000;
    const recurring = input.frequency && input.frequency !== 'ONCE';
    if (!future && !recurring) return false;
    this.guard.assertUserCanTransact(user);
    await this.guard.verifyPin(user, input.pin);
    const { pin: _p, otp: _o, idempotencyKey: _k, ...payload } = input;
    await this.prisma.scheduledTransfer.create({
      data: {
        userId: user.id,
        kind,
        payload: payload as unknown as Prisma.InputJsonValue,
        amount: toMoney(input.amount).toFixed(4),
        currency,
        recipientName,
        frequency: input.frequency ?? 'ONCE',
        nextRunAt: future ? input.scheduledFor! : new Date(),
      },
    });
    await this.notifications.notify(user.id, { category: 'TRANSACTIONS', type: 'SCHEDULED', title: 'Transfer scheduled', body: `${formatMoney(input.amount, currency)} to ${recipientName}`, link: '/app/transfer/scheduled', skipEmail: true });
    return true;
  }

  async runDueScheduled() {
    const due = await this.prisma.scheduledTransfer.findMany({ where: { active: true, nextRunAt: { lte: new Date() } }, take: 50, include: { user: true } });
    for (const st of due) {
      const payload = st.payload as Record<string, unknown>;
      const base = { ...payload, scheduledFor: undefined, frequency: 'ONCE' as const, pin: '', idempotencyKey: `sched:${st.id}:${st.runCount}` };
      const next = this.nextRun(st.nextRunAt, st.frequency);
      try {
        if (st.kind === 'INTERNAL') await this.internal(st.user, base as unknown as InternalInput, { scheduled: true });
        else await this.interbank(st.user, base as unknown as InterbankInput, { scheduled: true });
        await this.prisma.scheduledTransfer.update({ where: { id: st.id }, data: { lastRunAt: new Date(), runCount: { increment: 1 }, lastError: null, nextRunAt: next ?? st.nextRunAt, active: !!next } });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await this.prisma.scheduledTransfer.update({ where: { id: st.id }, data: { lastRunAt: new Date(), lastError: msg, runCount: { increment: 1 }, nextRunAt: next ?? st.nextRunAt, active: !!next } });
        await this.notifications.notify(st.userId, {
          category: 'TRANSACTIONS',
          type: 'SCHEDULED_FAILED',
          title: 'Scheduled transfer failed',
          body: `${formatMoney(st.amount.toString(), st.currency)} to ${st.recipientName}: ${msg}`,
          link: '/app/transfer/scheduled',
        });
      }
    }
    return due.length;
  }

  private nextRun(from: Date, freq: string): Date | null {
    const d = new Date(from);
    if (freq === 'DAILY') d.setDate(d.getDate() + 1);
    else if (freq === 'WEEKLY') d.setDate(d.getDate() + 7);
    else if (freq === 'MONTHLY') d.setMonth(d.getMonth() + 1);
    else return null;
    while (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
    return d;
  }

  // ---------- beneficiaries ----------

  async saveBeneficiary(userId: string, b: { type: 'INTERNAL' | 'INTERBANK' | 'WIRE'; name: string; accountNumber: string; bankCode?: string; bankName?: string; swiftCode?: string; country?: string; address?: string; nickname?: string }) {
    return this.prisma.beneficiary.upsert({
      where: { userId_type_accountNumber: { userId, type: b.type, accountNumber: b.accountNumber } },
      create: { userId, ...b, lastUsedAt: new Date() },
      update: { name: b.name, lastUsedAt: new Date(), ...(b.nickname ? { nickname: b.nickname } : {}) },
    });
  }

  async adminAudit(adminId: string, action: string, transferId: string, reason?: string) {
    await this.audit.log({ type: 'ADMIN', id: adminId }, action, { type: 'Transfer', id: transferId }, { reason });
  }
}
