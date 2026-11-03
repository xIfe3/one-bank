import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type EntryType, type JournalEntry, type LedgerAccount } from '@prisma/client';
import Decimal from 'decimal.js';
import { AppError } from '../../common/app-error';
import { generateReference } from '../../common/crypto';
import { PrismaService } from '../../common/infra';

export type Tx = Prisma.TransactionClient;

export interface Leg {
  accountId: string;
  /** Signed: positive = credit (increases balance), negative = debit. */
  amount: Decimal.Value;
}

export interface PostInput {
  type: EntryType;
  description: string;
  legs: Leg[];
  status?: 'COMPLETED' | 'PENDING';
  idempotencyKey?: string;
  reference?: string;
  category?: string;
  metadata?: Record<string, unknown>;
  counterpartyName?: string;
  counterpartyAccount?: string;
  counterpartyBank?: string;
  initiatorType?: 'USER' | 'ADMIN' | 'SYSTEM';
  initiatorId?: string;
  valueDate?: Date;
  reversalOfId?: string;
  /** Account ids allowed to go below zero for this posting (admin force). */
  allowNegative?: string[];
}

export const SYSTEM_CODES = [
  'BANK_EQUITY',
  'FEES',
  'FX_POOL',
  'INTERBANK_SETTLEMENT',
  'BILLS_SETTLEMENT',
  'CARD_SETTLEMENT',
  'INTEREST_EXPENSE',
  'LOAN_PORTFOLIO',
] as const;
export type SystemCode = (typeof SYSTEM_CODES)[number];

/** Account types whose balances may legitimately be negative. */
const NEGATIVE_OK = new Set(['SYSTEM', 'LOAN']);

/**
 * The only component allowed to mutate balances.
 *
 * Invariants:
 *  - every entry's legs sum to zero per currency
 *  - account.balance == SUM(postings.amount)
 *  - account.availableBalance == balance - active holds
 *  - customer balances never go negative (unless explicitly forced by an admin)
 */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger('Ledger');
  private systemCache = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  /** Run `fn` in a SERIALIZABLE transaction, retrying on serialization conflicts. */
  async run<T>(fn: (tx: Tx) => Promise<T>, attempts = 4): Promise<T> {
    for (let i = 1; ; i++) {
      try {
        return await this.prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000, maxWait: 10000 });
      } catch (e) {
        const retryable = e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2034' || e.code === 'P2028');
        const pgSerial = e instanceof Error && /could not serialize|deadlock detected|40001|40P01/.test(e.message);
        if ((retryable || pgSerial) && i < attempts) {
          await new Promise((r) => setTimeout(r, 20 * i + Math.random() * 50));
          continue;
        }
        throw e;
      }
    }
  }

  /** System accounts are created outside any caller transaction so a rollback cannot poison the cache. */
  async systemAccountId(code: SystemCode, currency: string): Promise<string> {
    const key = `${code}:${currency}`;
    const cached = this.systemCache.get(key);
    if (cached) return cached;
    const acct = await this.prisma.ledgerAccount.upsert({
      where: { systemCode_currency: { systemCode: code, currency } },
      create: { type: 'SYSTEM', systemCode: code, currency, name: `${code} ${currency}` },
      update: {},
    });
    this.systemCache.set(key, acct.id);
    return acct.id;
  }

  async findByIdempotencyKey(key: string) {
    return this.prisma.journalEntry.findUnique({ where: { idempotencyKey: key }, include: { postings: true, transfer: true } });
  }

  private async lock(tx: Tx, ids: string[]): Promise<Map<string, LedgerAccount>> {
    const unique = [...new Set(ids)].sort();
    if (!unique.length) return new Map();
    // Row locks in a stable order prevent deadlocks between concurrent postings.
    await tx.$queryRaw`SELECT id FROM "LedgerAccount" WHERE id IN (${Prisma.join(unique)}) ORDER BY id FOR UPDATE`;
    const rows = await tx.ledgerAccount.findMany({ where: { id: { in: unique } } });
    if (rows.length !== unique.length) throw new AppError('NOT_FOUND', 'Account not found');
    return new Map(rows.map((r) => [r.id, r]));
  }

  private validate(input: PostInput, accounts: Map<string, LedgerAccount>) {
    if (input.legs.length < 2) throw new Error('An entry needs at least two legs');
    const sums = new Map<string, Decimal>();
    for (const leg of input.legs) {
      const a = accounts.get(leg.accountId)!;
      const amt = new Decimal(leg.amount);
      if (amt.isZero()) throw new Error('Zero-amount leg');
      if (amt.decimalPlaces() > 4) throw new Error('Too many decimal places');
      sums.set(a.currency, (sums.get(a.currency) ?? new Decimal(0)).plus(amt));
      if (a.status === 'CLOSED') throw new AppError('ACCOUNT_FROZEN', `Account ${a.accountNumber ?? a.name} is closed`);
      if (amt.isNegative() && a.status === 'FROZEN') {
        throw new AppError('ACCOUNT_FROZEN', `Account ${a.accountNumber ?? a.name} is frozen. Contact support for help.`);
      }
    }
    for (const [cur, sum] of sums) {
      if (!sum.isZero()) throw new Error(`Unbalanced entry in ${cur}: ${sum.toString()}`);
    }
  }

  /**
   * Post a journal entry inside an existing transaction.
   * COMPLETED: postings written + balances updated.
   * PENDING:   legs stored, debit legs placed on hold (availableBalance reduced); settle() later.
   */
  async post(tx: Tx, input: PostInput): Promise<JournalEntry> {
    const accounts = await this.lock(
      tx,
      input.legs.map((l) => l.accountId),
    );
    this.validate(input, accounts);
    const status = input.status ?? 'COMPLETED';

    const entry = await tx.journalEntry.create({
      data: {
        reference: input.reference ?? generateReference(),
        idempotencyKey: input.idempotencyKey,
        type: input.type,
        status,
        description: input.description,
        category: input.category,
        metadata: { ...(input.metadata ?? {}), ...(status === 'PENDING' ? { pendingLegs: input.legs.map((l) => ({ accountId: l.accountId, amount: new Decimal(l.amount).toString() })) } : {}) } as Prisma.InputJsonValue,
        counterpartyName: input.counterpartyName,
        counterpartyAccount: input.counterpartyAccount,
        counterpartyBank: input.counterpartyBank,
        initiatorType: input.initiatorType ?? 'USER',
        initiatorId: input.initiatorId,
        valueDate: input.valueDate ?? new Date(),
        reversalOfId: input.reversalOfId,
      },
    });

    if (status === 'COMPLETED') {
      await this.apply(tx, entry.id, input.legs, accounts, input.allowNegative ?? []);
    } else {
      for (const leg of input.legs) {
        const amt = new Decimal(leg.amount);
        if (!amt.isNegative()) continue;
        const a = accounts.get(leg.accountId)!;
        const avail = new Decimal(a.availableBalance.toString()).plus(amt);
        if (avail.isNegative() && !NEGATIVE_OK.has(a.type)) throw new AppError('INSUFFICIENT_FUNDS', 'Insufficient funds for this transaction');
        await tx.ledgerAccount.update({ where: { id: a.id }, data: { availableBalance: avail.toFixed(4) } });
        await tx.hold.create({ data: { entryId: entry.id, accountId: a.id, amount: amt.abs().toFixed(4) } });
      }
    }
    return entry;
  }

  private async apply(tx: Tx, entryId: string, legs: Leg[], accounts: Map<string, LedgerAccount>, allowNegative: string[]) {
    // Aggregate per account so an account appearing twice is updated once.
    const deltas = new Map<string, Decimal>();
    for (const l of legs) deltas.set(l.accountId, (deltas.get(l.accountId) ?? new Decimal(0)).plus(l.amount));
    const after = new Map<string, Decimal>();
    for (const [id, delta] of deltas) {
      const a = accounts.get(id)!;
      const balance = new Decimal(a.balance.toString()).plus(delta);
      const available = new Decimal(a.availableBalance.toString()).plus(delta);
      if (delta.isNegative() && available.isNegative() && !NEGATIVE_OK.has(a.type) && !allowNegative.includes(id)) {
        throw new AppError('INSUFFICIENT_FUNDS', 'Insufficient funds for this transaction');
      }
      await tx.ledgerAccount.update({ where: { id }, data: { balance: balance.toFixed(4), availableBalance: available.toFixed(4) } });
      a.balance = new Prisma.Decimal(balance.toFixed(4));
      a.availableBalance = new Prisma.Decimal(available.toFixed(4));
      after.set(id, balance);
    }
    await tx.posting.createMany({
      data: legs.map((l) => ({
        entryId,
        accountId: l.accountId,
        amount: new Decimal(l.amount).toFixed(4),
        currency: accounts.get(l.accountId)!.currency,
        balanceAfter: after.get(l.accountId)!.toFixed(4),
      })),
    });
  }

  /** Settle a PENDING entry: release holds, apply legs. */
  async settle(tx: Tx, entryId: string): Promise<JournalEntry> {
    const entry = await tx.journalEntry.findUniqueOrThrow({ where: { id: entryId }, include: { holds: true } });
    if (entry.status !== 'PENDING') return entry;
    const legs = ((entry.metadata as { pendingLegs?: Leg[] })?.pendingLegs ?? []) as Leg[];
    const accounts = await this.lock(
      tx,
      legs.map((l) => l.accountId),
    );
    await this.releaseHolds(tx, entry.holds, accounts);
    await this.apply(tx, entry.id, legs, accounts, []);
    return tx.journalEntry.update({ where: { id: entryId }, data: { status: 'COMPLETED' } });
  }

  /** Fail a PENDING entry: release holds, no postings. */
  async fail(tx: Tx, entryId: string, reason: string): Promise<JournalEntry> {
    const entry = await tx.journalEntry.findUniqueOrThrow({ where: { id: entryId }, include: { holds: true } });
    if (entry.status !== 'PENDING') return entry;
    const accounts = await this.lock(
      tx,
      entry.holds.map((h) => h.accountId),
    );
    await this.releaseHolds(tx, entry.holds, accounts);
    return tx.journalEntry.update({ where: { id: entryId }, data: { status: 'FAILED', failureReason: reason } });
  }

  private async releaseHolds(tx: Tx, holds: { id: string; accountId: string; amount: Prisma.Decimal; releasedAt: Date | null }[], accounts: Map<string, LedgerAccount>) {
    for (const h of holds) {
      if (h.releasedAt) continue;
      const a = accounts.get(h.accountId) ?? (await tx.ledgerAccount.findUniqueOrThrow({ where: { id: h.accountId } }));
      const avail = new Decimal(a.availableBalance.toString()).plus(h.amount.toString());
      await tx.ledgerAccount.update({ where: { id: a.id }, data: { availableBalance: avail.toFixed(4) } });
      a.availableBalance = new Prisma.Decimal(avail.toFixed(4));
      await tx.hold.update({ where: { id: h.id }, data: { releasedAt: new Date() } });
    }
  }

  /** Reverse a COMPLETED entry by posting the negated legs. Original is marked REVERSED. */
  async reverse(tx: Tx, entryId: string, opts: { reason: string; initiatorType: 'ADMIN' | 'SYSTEM'; initiatorId?: string; force?: boolean }) {
    const entry = await tx.journalEntry.findUniqueOrThrow({ where: { id: entryId }, include: { postings: true } });
    if (entry.status === 'PENDING') {
      return { original: await this.fail(tx, entryId, opts.reason), reversal: null };
    }
    if (entry.status !== 'COMPLETED') throw new AppError('CONFLICT', `Only completed transactions can be reversed (status: ${entry.status})`);
    if (entry.type === 'REVERSAL') throw new AppError('CONFLICT', 'A reversal cannot itself be reversed');
    const legs = entry.postings.map((p) => ({ accountId: p.accountId, amount: new Decimal(p.amount.toString()).negated() }));
    const reversal = await this.post(tx, {
      type: 'REVERSAL',
      description: `Reversal of ${entry.reference}: ${entry.description}`,
      legs,
      reversalOfId: entry.id,
      initiatorType: opts.initiatorType,
      initiatorId: opts.initiatorId,
      metadata: { reason: opts.reason, originalType: entry.type },
      counterpartyName: entry.counterpartyName ?? undefined,
      allowNegative: opts.force ? legs.map((l) => l.accountId) : [],
    });
    const original = await tx.journalEntry.update({ where: { id: entry.id }, data: { status: 'REVERSED' } });
    return { original, reversal };
  }

  /** Recompute balances from postings and compare with cached values. */
  async reconcile() {
    const rows = await this.prisma.$queryRaw<{ id: string; name: string; currency: string; balance: string; available: string; posted: string | null; held: string | null }[]>`
      SELECT a.id, a.name, a.currency, a.balance::text AS balance, a."availableBalance"::text AS available,
        (SELECT COALESCE(SUM(p.amount),0)::text FROM "Posting" p WHERE p."accountId" = a.id) AS posted,
        (SELECT COALESCE(SUM(h.amount),0)::text FROM "Hold" h WHERE h."accountId" = a.id AND h."releasedAt" IS NULL) AS held
      FROM "LedgerAccount" a`;
    const mismatches = rows
      .filter((r) => !new Decimal(r.balance).eq(r.posted ?? 0) || !new Decimal(r.available).eq(new Decimal(r.posted ?? 0).minus(r.held ?? 0)))
      .map((r) => ({ ...r, expectedAvailable: new Decimal(r.posted ?? 0).minus(r.held ?? 0).toFixed(4) }));
    const totals = await this.prisma.$queryRaw<{ currency: string; total: string }[]>`
      SELECT currency, SUM(amount)::text AS total FROM "Posting" GROUP BY currency ORDER BY currency`;
    const unbalanced = await this.prisma.$queryRaw<{ entryId: string; currency: string; total: string }[]>`
      SELECT "entryId", currency, SUM(amount)::text AS total FROM "Posting" GROUP BY "entryId", currency HAVING SUM(amount) <> 0 LIMIT 50`;
    return {
      checkedAccounts: rows.length,
      mismatches,
      trialBalance: totals.map((t) => ({ currency: t.currency, total: t.total, balanced: new Decimal(t.total).isZero() })),
      unbalancedEntries: unbalanced,
      ok: mismatches.length === 0 && unbalanced.length === 0 && totals.every((t) => new Decimal(t.total).isZero()),
    };
  }
}
