import { Injectable } from '@nestjs/common';
import type { LedgerAccount, User } from '@prisma/client';
import argon2 from 'argon2';
import Decimal from 'decimal.js';
import { authenticator } from 'otplib';
import { AppError } from '../../common/app-error';
import { decrypt, randomDigits } from '../../common/crypto';
import { PrismaService, RedisService } from '../../common/infra';
import { FxService } from './fx.service';
import { MailService } from './mail.service';
import { SettingsService } from './settings.service';

const OUTBOUND_TYPES = ['INTERNAL_TRANSFER', 'INTERBANK', 'WIRE', 'BILL', 'CARD_FUNDING', 'FX'] as const;

/**
 * Pre-flight checks for every customer money movement: account status, ownership,
 * PIN, step-up OTP, KYC tier limits. Services call `authorize()` before posting.
 */
@Injectable()
export class MoneyGuardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
    private readonly fx: FxService,
    private readonly mail: MailService,
  ) {}

  assertUserCanTransact(user: User) {
    if (user.status === 'SUSPENDED') throw new AppError('ACCOUNT_SUSPENDED', 'Your account is suspended. Outgoing transactions are disabled — please contact support.');
    if (user.status === 'BLOCKED' || user.status === 'CLOSED') throw new AppError('ACCOUNT_BLOCKED', 'Your account is not active.');
    if (user.status !== 'ACTIVE') throw new AppError('EMAIL_NOT_VERIFIED', 'Please verify your email first.');
  }

  async ownedAccount(userId: string, accountId: string, types: string[] = ['CUSTOMER_WALLET']): Promise<LedgerAccount> {
    const acct = await this.prisma.ledgerAccount.findFirst({ where: { id: accountId, ownerId: userId } });
    if (!acct || !types.includes(acct.type)) throw new AppError('NOT_FOUND', 'Account not found');
    if (acct.status === 'FROZEN') throw new AppError('ACCOUNT_FROZEN', 'This account is frozen. Contact support for help.');
    if (acct.status === 'CLOSED') throw new AppError('ACCOUNT_FROZEN', 'This account is closed.');
    return acct;
  }

  async verifyPin(user: User, pin: string) {
    if (!user.transactionPinHash) throw new AppError('PIN_NOT_SET', 'Set up your transaction PIN in Settings → Security first.');
    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      const mins = Math.ceil((user.pinLockedUntil.getTime() - Date.now()) / 60000);
      throw new AppError('PIN_LOCKED', `Too many wrong PIN attempts. Try again in ${mins} minute(s).`);
    }
    const ok = await argon2.verify(user.transactionPinHash, pin);
    if (!ok) {
      const attempts = user.pinFailedAttempts + 1;
      const lock = attempts >= 5;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { pinFailedAttempts: lock ? 0 : attempts, pinLockedUntil: lock ? new Date(Date.now() + 30 * 60_000) : undefined },
      });
      if (lock) throw new AppError('PIN_LOCKED', 'Too many wrong PIN attempts. Transactions are locked for 30 minutes.');
      throw new AppError('INVALID_PIN', `Incorrect PIN. ${5 - attempts} attempt(s) left.`);
    }
    if (user.pinFailedAttempts > 0) await this.prisma.user.update({ where: { id: user.id }, data: { pinFailedAttempts: 0 } });
  }

  async sendOtp(user: User, purpose = 'confirm your transaction') {
    const code = randomDigits(6);
    await this.redis.client.set(`otp:${user.id}`, code, 'EX', 600);
    await this.mail.send(user.email, 'otp', { code, purpose });
    return { sent: true, channel: user.twoFactorEnabled ? 'authenticator_or_email' : 'email' };
  }

  async verifyOtp(user: User, code?: string): Promise<boolean> {
    if (!code) return false;
    if (user.twoFactorEnabled && user.twoFactorSecret && authenticator.check(code, decrypt(user.twoFactorSecret))) return true;
    const stored = await this.redis.client.get(`otp:${user.id}`);
    if (stored && stored === code) {
      await this.redis.client.del(`otp:${user.id}`);
      return true;
    }
    return false;
  }

  /** Sum of today's outbound customer debits (completed + pending holds), in USD. */
  async usedTodayUsd(userId: string): Promise<Decimal> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const rows = await this.prisma.$queryRaw<{ currency: string; total: string }[]>`
      SELECT a.currency, COALESCE(SUM(-p.amount),0)::text AS total
      FROM "Posting" p JOIN "LedgerAccount" a ON a.id = p."accountId" JOIN "JournalEntry" e ON e.id = p."entryId"
      WHERE a."ownerId" = ${userId} AND a.type = 'CUSTOMER_WALLET' AND p.amount < 0 AND p."createdAt" >= ${start}
        AND e.type::text = ANY(${OUTBOUND_TYPES as unknown as string[]})
      GROUP BY a.currency`;
    const holds = await this.prisma.$queryRaw<{ currency: string; total: string }[]>`
      SELECT a.currency, COALESCE(SUM(h.amount),0)::text AS total
      FROM "Hold" h JOIN "LedgerAccount" a ON a.id = h."accountId"
      WHERE a."ownerId" = ${userId} AND h."releasedAt" IS NULL AND h."createdAt" >= ${start}
      GROUP BY a.currency`;
    let total = new Decimal(0);
    for (const r of [...rows, ...holds]) total = total.plus(await this.fx.toUsd(r.total, r.currency));
    return total;
  }

  async limits(user: User) {
    const s = await this.settings.get();
    const tier = s.kycLimits[String(user.kycLevel)] ?? s.kycLimits['0'];
    const dailyUsd = user.limitOverrideDailyUsd ? Number(user.limitOverrideDailyUsd) : tier.dailyUsd;
    const singleUsd = user.limitOverrideDailyUsd ? Math.max(Number(user.limitOverrideDailyUsd), tier.singleUsd) : tier.singleUsd;
    const used = await this.usedTodayUsd(user.id);
    return { kycLevel: user.kycLevel, label: tier.label, dailyUsd, singleUsd, usedTodayUsd: used.toDecimalPlaces(2).toNumber(), remainingUsd: Decimal.max(0, new Decimal(dailyUsd).minus(used)).toDecimalPlaces(2).toNumber() };
  }

  /**
   * Full pre-flight for an outbound money action.
   * @returns amount in USD (for downstream thresholds like review / fraud rules)
   */
  async authorize(user: User, opts: { amount: Decimal.Value; currency: string; pin: string; otp?: string; minKyc?: number; skipLimits?: boolean }): Promise<Decimal> {
    this.assertUserCanTransact(user);
    if (opts.minKyc && user.kycLevel < opts.minKyc) {
      throw new AppError('KYC_REQUIRED', `This service requires identity verification level ${opts.minKyc}. Complete verification in Settings → Verification.`);
    }
    await this.verifyPin(user, opts.pin);
    const amountUsd = await this.fx.toUsd(opts.amount, opts.currency);
    if (!opts.skipLimits) {
      const lim = await this.limits(user);
      if (lim.dailyUsd <= 0) throw new AppError('KYC_REQUIRED', 'Verify your phone and identity to start sending money.');
      if (amountUsd.gt(lim.singleUsd)) throw new AppError('LIMIT_EXCEEDED', `This exceeds your single-transaction limit of $${lim.singleUsd.toLocaleString()} (USD equivalent).`);
      if (amountUsd.gt(lim.remainingUsd)) throw new AppError('LIMIT_EXCEEDED', `This exceeds your remaining daily limit of $${lim.remainingUsd.toLocaleString()} (USD equivalent).`);
    }
    const s = await this.settings.get();
    if (amountUsd.gte(s.otpThresholdUsd)) {
      if (!opts.otp) throw new AppError('TWO_FACTOR_REQUIRED', 'This transaction needs a verification code.', { otpRequired: true, twoFactorEnabled: user.twoFactorEnabled });
      if (!(await this.verifyOtp(user, opts.otp))) throw new AppError('INVALID_2FA', 'Invalid or expired verification code.');
    }
    return amountUsd;
  }
}
