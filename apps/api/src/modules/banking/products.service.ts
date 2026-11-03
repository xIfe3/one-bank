import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { calculateFee, formatMoney, toMoney } from '@onebank/shared';
import { createHash } from 'crypto';
import Decimal from 'decimal.js';
import { AppError, notFound } from '../../common/app-error';
import { decrypt, encrypt, generatePan, randomDigits } from '../../common/crypto';
import { PrismaService } from '../../common/infra';
import { FxService } from '../core/fx.service';
import { LedgerService } from '../core/ledger.service';
import { MoneyGuardService } from '../core/money-guard.service';
import { NotificationsService } from '../core/notifications.service';
import { SettingsService } from '../core/settings.service';
import { AccountsService } from './accounts.service';

interface MoneyAuth {
  pin: string;
  otp?: string;
  idempotencyKey: string;
}

const NAMES = ['A. Johnson', 'M. Okeke', 'S. Williams', 'D. Adebayo', 'L. Carter', 'K. Mensah', 'R. Thompson', 'F. Ibrahim'];

/** Bills, virtual cards, savings goals and fixed deposits. */
@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly guard: MoneyGuardService,
    private readonly fx: FxService,
    private readonly settings: SettingsService,
    private readonly accounts: AccountsService,
    private readonly notifications: NotificationsService,
  ) {}

  // =================== Bills ===================

  billProviders(category?: string) {
    return this.prisma.billProvider.findMany({ where: { active: true, ...(category ? { category } : {}) }, orderBy: { name: 'asc' } });
  }

  async validateBillCustomer(providerId: string, customerId: string) {
    const p = await this.prisma.billProvider.findUnique({ where: { id: providerId } });
    if (!p || !p.active) throw notFound('Provider');
    if (customerId.endsWith('000')) throw new AppError('VALIDATION', 'We could not find a customer with that ID at this provider.');
    const h = createHash('sha256').update(`${p.code}:${customerId}`).digest();
    return { customerName: p.category === 'AIRTIME' || p.category === 'DATA' ? `Mobile ${customerId}` : NAMES[h[0] % NAMES.length], provider: p.name, customerId };
  }

  async payBill(user: User, input: MoneyAuth & { fromAccountId: string; providerId: string; customerId: string; amount: number; category: string }) {
    await this.settings.assertFeature('bills');
    const key = `${user.id}:${input.idempotencyKey}`;
    const prior = await this.ledger.findByIdempotencyKey(key);
    if (prior) return prior;
    const from = await this.guard.ownedAccount(user.id, input.fromAccountId);
    const provider = await this.prisma.billProvider.findUnique({ where: { id: input.providerId } });
    if (!provider || !provider.active) throw notFound('Provider');
    if (!provider.currencies.includes(from.currency)) throw new AppError('VALIDATION', `${provider.name} accepts ${provider.currencies.join(', ')} only.`);
    const { customerName } = await this.validateBillCustomer(provider.id, input.customerId);
    const amount = toMoney(input.amount);
    const s = await this.settings.get();
    const fee = await this.fx.fromUsd(calculateFee(await this.fx.toUsd(amount, from.currency), s.fees.bill), from.currency);
    await this.guard.authorize(user, { amount: amount.plus(fee), currency: from.currency, pin: input.pin, otp: input.otp });
    const token = provider.category === 'ELECTRICITY' ? randomDigits(20).replace(/(\d{4})(?=\d)/g, '$1-') : null;
    const legs = [
      { accountId: from.id, amount: amount.plus(fee).negated() },
      { accountId: await this.ledger.systemAccountId('BILLS_SETTLEMENT', from.currency), amount },
    ];
    if (!fee.isZero()) legs.push({ accountId: await this.ledger.systemAccountId('FEES', from.currency), amount: fee });
    const entry = await this.ledger.run(async (tx) => {
      const entry = await this.ledger.post(tx, {
        type: 'BILL',
        description: `${provider.name} · ${input.customerId}`,
        category: provider.category === 'AIRTIME' || provider.category === 'DATA' ? 'Phone & Internet' : provider.category === 'TV' ? 'Entertainment' : 'Utilities',
        legs,
        idempotencyKey: key,
        counterpartyName: provider.name,
        counterpartyAccount: input.customerId,
        initiatorId: user.id,
        metadata: { token, customerName, fee: fee.toFixed(2) },
      });
      await tx.billPayment.create({
        data: { userId: user.id, entryId: entry.id, providerId: provider.id, customerId: input.customerId, customerName, amount: amount.toFixed(4), currency: from.currency, token },
      });
      return entry;
    });
    await this.notifications.notify(user.id, {
      category: 'TRANSACTIONS',
      type: 'BILL_PAID',
      title: `${provider.name} payment successful`,
      body: `${formatMoney(amount, from.currency)} for ${input.customerId}${token ? ` · Token ${token}` : ''}`,
      link: `/app/transactions/${entry.id}`,
      email: { template: 'bill-paid', data: { provider: provider.name, amount: formatMoney(amount, from.currency), customerName, customerId: input.customerId, token, reference: entry.reference, entryId: entry.id } },
    });
    await this.notifications.balanceChanged(user.id);
    return { ...entry, token, customerName };
  }

  // =================== Cards ===================

  async cards(userId: string) {
    const cards = await this.prisma.virtualCard.findMany({ where: { userId, status: { not: 'TERMINATED' } }, orderBy: { createdAt: 'desc' } });
    const accts = await this.prisma.ledgerAccount.findMany({ where: { id: { in: cards.map((c) => c.accountId) } } });
    return cards.map((c) => this.cardDto(c, accts.find((a) => a.id === c.accountId)!));
  }

  private cardDto(c: { id: string; brand: string; label: string; nameOnCard: string; last4: string; expMonth: number; expYear: number; currency: string; status: string; statusReason: string | null; spendLimit: Decimal.Value | { toString(): string }; color: string; accountId: string; createdAt: Date }, a: { balance: { toString(): string } }) {
    return {
      id: c.id,
      brand: c.brand,
      label: c.label,
      nameOnCard: c.nameOnCard,
      last4: c.last4,
      expMonth: c.expMonth,
      expYear: c.expYear,
      currency: c.currency,
      status: c.status,
      statusReason: c.statusReason,
      spendLimit: new Decimal(c.spendLimit.toString()).toFixed(2),
      color: c.color,
      accountId: c.accountId,
      balance: new Decimal(a.balance.toString()).toFixed(2),
      createdAt: c.createdAt,
    };
  }

  async createCard(user: User, input: MoneyAuth & { fundingAccountId: string; brand: 'VISA' | 'MASTERCARD'; label: string; initialFunding: number }) {
    await this.settings.assertFeature('cards');
    const key = `${user.id}:${input.idempotencyKey}`;
    const prior = await this.ledger.findByIdempotencyKey(key);
    if (prior) return prior;
    if (user.kycLevel < 1) throw new AppError('KYC_REQUIRED', 'Verify your phone number to get a virtual card.');
    const active = await this.prisma.virtualCard.count({ where: { userId: user.id, status: { not: 'TERMINATED' } } });
    if (active >= 5) throw new AppError('CONFLICT', 'You can have up to 5 active cards.');
    const from = await this.guard.ownedAccount(user.id, input.fundingAccountId);
    const s = await this.settings.get();
    const fee = await this.fx.fromUsd(calculateFee(0, s.fees.cardIssue), from.currency);
    const funding = toMoney(input.initialFunding ?? 0);
    await this.guard.authorize(user, { amount: fee.plus(funding), currency: from.currency, pin: input.pin, otp: input.otp });
    const pan = generatePan(input.brand === 'VISA' ? '4' + randomDigits(5) : '5' + String(1 + Math.floor(Math.random() * 5)) + randomDigits(4));
    const now = new Date();
    const colors = ['navy', 'gold', 'black', 'emerald'];
    const card = await this.ledger.run(async (tx) => {
      const acct = await tx.ledgerAccount.create({ data: { type: 'CARD', currency: from.currency, ownerId: user.id, name: `${input.brand} card •••• ${pan.slice(-4)}` } });
      const card = await tx.virtualCard.create({
        data: {
          userId: user.id,
          accountId: acct.id,
          brand: input.brand,
          label: input.label || 'Virtual card',
          nameOnCard: `${user.firstName} ${user.lastName}`.toUpperCase().slice(0, 26),
          last4: pan.slice(-4),
          panEnc: encrypt(pan),
          cvvEnc: encrypt(randomDigits(3)),
          expMonth: now.getMonth() + 1,
          expYear: now.getFullYear() + 3,
          currency: from.currency,
          color: colors[active % colors.length],
        },
      });
      const legs = [{ accountId: from.id, amount: fee.plus(funding).negated() }];
      if (!fee.isZero()) legs.push({ accountId: await this.ledger.systemAccountId('FEES', from.currency), amount: fee });
      if (!funding.isZero()) legs.push({ accountId: acct.id, amount: funding });
      if (legs.length > 1) {
        await this.ledger.post(tx, {
          type: funding.isZero() ? 'FEE' : 'CARD_FUNDING',
          description: `Virtual card issuance${funding.isZero() ? '' : ' & funding'} •••• ${pan.slice(-4)}`,
          category: 'Fees',
          legs,
          idempotencyKey: key,
          counterpartyName: 'One Bank Cards',
          initiatorId: user.id,
          metadata: { cardId: card.id, fee: fee.toFixed(2) },
        });
      }
      return card;
    });
    await this.notifications.notify(user.id, {
      category: 'TRANSACTIONS',
      type: 'CARD_CREATED',
      title: 'Your virtual card is ready',
      body: `${input.brand} •••• ${card.last4} is active and ready to use.`,
      link: '/app/cards',
      email: { template: 'card-event', data: { subject: 'Your virtual card is ready', message: `Your ${input.brand} virtual card ending ${card.last4} is active.`, tone: 'success' } },
    });
    await this.notifications.balanceChanged(user.id);
    return card;
  }

  private async ownedCard(userId: string, cardId: string) {
    const c = await this.prisma.virtualCard.findFirst({ where: { id: cardId, userId } });
    if (!c || c.status === 'TERMINATED') throw notFound('Card');
    return c;
  }

  async revealCard(user: User, cardId: string, pin: string) {
    const c = await this.ownedCard(user.id, cardId);
    await this.guard.verifyPin(user, pin);
    const pan = decrypt(c.panEnc);
    return { pan: pan.replace(/(\d{4})(?=\d)/g, '$1 '), cvv: decrypt(c.cvvEnc), expMonth: c.expMonth, expYear: c.expYear, nameOnCard: c.nameOnCard };
  }

  async fundCard(user: User, cardId: string, input: MoneyAuth & { accountId: string; amount: number }, direction: 'fund' | 'withdraw') {
    await this.settings.assertFeature('cards');
    const key = `${user.id}:${input.idempotencyKey}`;
    const prior = await this.ledger.findByIdempotencyKey(key);
    if (prior) return prior;
    const card = await this.ownedCard(user.id, cardId);
    if (card.status !== 'ACTIVE') throw new AppError('ACCOUNT_FROZEN', 'Unfreeze this card first.');
    const wallet = await this.guard.ownedAccount(user.id, input.accountId);
    if (wallet.currency !== card.currency) throw new AppError('VALIDATION', `This card is in ${card.currency}. Choose a ${card.currency} account.`);
    const amount = toMoney(input.amount);
    if (direction === 'fund') await this.guard.authorize(user, { amount, currency: wallet.currency, pin: input.pin, otp: input.otp });
    else {
      this.guard.assertUserCanTransact(user);
      await this.guard.verifyPin(user, input.pin);
    }
    const entry = await this.ledger.run((tx) =>
      this.ledger.post(tx, {
        type: direction === 'fund' ? 'CARD_FUNDING' : 'CARD_WITHDRAWAL',
        description: direction === 'fund' ? `Card top-up •••• ${card.last4}` : `Withdrawal from card •••• ${card.last4}`,
        category: 'Transfers',
        legs:
          direction === 'fund'
            ? [
                { accountId: wallet.id, amount: amount.negated() },
                { accountId: card.accountId, amount },
              ]
            : [
                { accountId: card.accountId, amount: amount.negated() },
                { accountId: wallet.id, amount },
              ],
        idempotencyKey: key,
        counterpartyName: `${card.brand} •••• ${card.last4}`,
        initiatorId: user.id,
        metadata: { cardId: card.id },
      }),
    );
    await this.notifications.balanceChanged(user.id);
    return entry;
  }

  async setCardStatus(user: User, cardId: string, action: 'freeze' | 'unfreeze') {
    const card = await this.ownedCard(user.id, cardId);
    if (card.status === 'FROZEN' && card.statusReason?.startsWith('ADMIN:') && action === 'unfreeze') {
      throw new AppError('FORBIDDEN', 'This card was frozen by One Bank. Please contact support.');
    }
    const updated = await this.prisma.virtualCard.update({ where: { id: card.id }, data: { status: action === 'freeze' ? 'FROZEN' : 'ACTIVE', statusReason: action === 'freeze' ? 'Frozen by you' : null } });
    await this.notifications.notify(user.id, { category: 'SECURITY', type: `CARD_${action.toUpperCase()}`, title: `Card ${action === 'freeze' ? 'frozen' : 'unfrozen'}`, body: `${card.brand} •••• ${card.last4}`, link: '/app/cards', skipEmail: true });
    return updated;
  }

  async setCardLimit(user: User, cardId: string, spendLimit: number) {
    const card = await this.ownedCard(user.id, cardId);
    return this.prisma.virtualCard.update({ where: { id: card.id }, data: { spendLimit: toMoney(spendLimit).toFixed(4) } });
  }

  async terminateCard(user: User, cardId: string, pin: string) {
    const card = await this.ownedCard(user.id, cardId);
    await this.guard.verifyPin(user, pin);
    const acct = await this.prisma.ledgerAccount.findUniqueOrThrow({ where: { id: card.accountId } });
    const wallet = await this.prisma.ledgerAccount.findFirst({ where: { ownerId: user.id, type: 'CUSTOMER_WALLET', currency: card.currency, status: { not: 'CLOSED' } } });
    await this.ledger.run(async (tx) => {
      const bal = new Decimal(acct.balance.toString());
      if (bal.gt(0)) {
        if (!wallet) throw new AppError('CONFLICT', `Open a ${card.currency} account to receive the card balance.`);
        await tx.ledgerAccount.update({ where: { id: acct.id }, data: { status: 'ACTIVE' } });
        await this.ledger.post(tx, {
          type: 'CARD_WITHDRAWAL',
          description: `Card terminated — balance returned •••• ${card.last4}`,
          legs: [
            { accountId: acct.id, amount: bal.negated() },
            { accountId: wallet.id, amount: bal },
          ],
          initiatorId: user.id,
          counterpartyName: `${card.brand} •••• ${card.last4}`,
        });
      }
      await tx.ledgerAccount.update({ where: { id: acct.id }, data: { status: 'CLOSED' } });
      await tx.virtualCard.update({ where: { id: card.id }, data: { status: 'TERMINATED', statusReason: 'Terminated by you' } });
    });
    await this.notifications.notify(user.id, { category: 'SECURITY', type: 'CARD_TERMINATED', title: 'Card terminated', body: `${card.brand} •••• ${card.last4} was permanently terminated.`, link: '/app/cards', skipEmail: true });
    await this.notifications.balanceChanged(user.id);
    return { ok: true };
  }

  /** Simulated merchant authorisation against the card balance + limits. */
  async simulatePurchase(userId: string, cardId: string, input: { merchant: string; amount: number; category: string }, opts: { admin?: boolean } = {}) {
    const card = await this.prisma.virtualCard.findFirst({ where: { id: cardId, ...(opts.admin ? {} : { userId }) } });
    if (!card || card.status === 'TERMINATED') throw notFound('Card');
    const amount = toMoney(input.amount);
    const acct = await this.prisma.ledgerAccount.findUniqueOrThrow({ where: { id: card.accountId } });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: card.userId } });
    let decline: string | null = null;
    if (card.status === 'FROZEN') decline = 'Card is frozen';
    else if (user.status !== 'ACTIVE') decline = 'Account restricted';
    else if (new Decimal(card.spendLimit.toString()).gt(0) && amount.gt(card.spendLimit.toString())) decline = 'Exceeds card spend limit';
    else if (amount.gt(acct.availableBalance.toString())) decline = 'Insufficient card balance';

    if (decline) {
      await this.prisma.cardTransaction.create({ data: { cardId: card.id, merchant: input.merchant, category: input.category, amount: amount.toFixed(4), currency: card.currency, status: 'DECLINED', declineReason: decline } });
      await this.notifications.notify(card.userId, {
        category: 'TRANSACTIONS',
        type: 'CARD_DECLINED',
        title: 'Card payment declined',
        body: `${formatMoney(amount, card.currency)} at ${input.merchant}: ${decline}`,
        link: '/app/cards',
        email: { template: 'card-event', data: { subject: 'Card payment declined', message: `A payment of ${formatMoney(amount, card.currency)} at ${input.merchant} was declined: ${decline}.`, tone: 'alert' } },
      });
      return { approved: false, reason: decline };
    }
    const entry = await this.ledger.run(async (tx) => {
      const entry = await this.ledger.post(tx, {
        type: 'CARD_SPEND',
        description: input.merchant,
        category: input.category,
        legs: [
          { accountId: card.accountId, amount: amount.negated() },
          { accountId: await this.ledger.systemAccountId('CARD_SETTLEMENT', card.currency), amount },
        ],
        counterpartyName: input.merchant,
        initiatorType: opts.admin ? 'ADMIN' : 'USER',
        metadata: { cardId: card.id, last4: card.last4 },
      });
      await tx.cardTransaction.create({ data: { cardId: card.id, entryId: entry.id, merchant: input.merchant, category: input.category, amount: amount.toFixed(4), currency: card.currency } });
      return entry;
    });
    await this.notifications.notify(card.userId, { category: 'TRANSACTIONS', type: 'CARD_SPEND', title: `${formatMoney(amount, card.currency)} at ${input.merchant}`, body: `${card.brand} •••• ${card.last4}`, link: `/app/transactions/${entry.id}`, skipEmail: true });
    await this.notifications.balanceChanged(card.userId);
    return { approved: true, entryId: entry.id };
  }

  async cardTransactions(userId: string, cardId: string) {
    await this.ownedCard(userId, cardId);
    return this.prisma.cardTransaction.findMany({ where: { cardId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  // =================== Savings ===================

  async savingsOverview(userId: string) {
    const [goals, deposits] = await Promise.all([
      this.prisma.savingsGoal.findMany({ where: { userId, status: { not: 'CLOSED' } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.fixedDeposit.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    ]);
    const accts = await this.prisma.ledgerAccount.findMany({ where: { id: { in: [...goals.map((g) => g.accountId), ...deposits.map((d) => d.accountId)] } } });
    const s = await this.settings.get();
    return {
      savingsRate: s.savingsRate,
      fixedDepositRates: s.fixedDepositRates,
      goals: goals.map((g) => {
        const a = accts.find((x) => x.id === g.accountId)!;
        return { ...g, currency: a.currency, balance: a.balance.toFixed(2), targetAmount: g.targetAmount.toFixed(2), autoSaveAmount: g.autoSaveAmount.toFixed(2), progress: Math.min(100, Number(new Decimal(a.balance.toString()).div(g.targetAmount.toString()).mul(100).toFixed(1))) };
      }),
      fixedDeposits: deposits.map((d) => {
        const days = Math.max(0, Math.min(d.tenorDays, (Date.now() - d.startsAt.getTime()) / 86_400_000));
        const accrued = new Decimal(d.principal.toString()).mul(d.rate.toString()).div(100).mul(days).div(365);
        const expected = new Decimal(d.principal.toString()).mul(d.rate.toString()).div(100).mul(d.tenorDays).div(365);
        return { ...d, principal: d.principal.toFixed(2), rate: d.rate.toFixed(2), interestPaid: d.interestPaid.toFixed(2), accruedInterest: toMoney(accrued).toFixed(2), expectedInterest: toMoney(expected).toFixed(2) };
      }),
    };
  }

  async createGoal(user: User, input: { name: string; currency: string; targetAmount: number; targetDate?: Date; autoSaveAmount: number; autoSaveFrequency: string; autoSaveSourceId?: string }) {
    await this.settings.assertFeature('savings');
    this.guard.assertUserCanTransact(user);
    if (input.autoSaveSourceId) await this.guard.ownedAccount(user.id, input.autoSaveSourceId);
    const acct = await this.prisma.ledgerAccount.create({ data: { type: 'SAVINGS', currency: input.currency, ownerId: user.id, name: `Savings · ${input.name}` } });
    const next = input.autoSaveFrequency === 'NONE' ? null : this.addPeriod(new Date(), input.autoSaveFrequency);
    return this.prisma.savingsGoal.create({
      data: {
        userId: user.id,
        accountId: acct.id,
        name: input.name,
        targetAmount: toMoney(input.targetAmount).toFixed(4),
        targetDate: input.targetDate,
        autoSaveAmount: toMoney(input.autoSaveAmount ?? 0).toFixed(4),
        autoSaveFrequency: input.autoSaveFrequency,
        autoSaveSourceId: input.autoSaveSourceId,
        nextAutoSaveAt: next,
      },
    });
  }

  private addPeriod(d: Date, freq: string) {
    const n = new Date(d);
    if (freq === 'WEEKLY') n.setDate(n.getDate() + 7);
    else n.setMonth(n.getMonth() + 1);
    return n;
  }

  async moveSavings(user: User, goalId: string, input: MoneyAuth & { accountId: string; amount: number }, direction: 'deposit' | 'withdraw') {
    await this.settings.assertFeature('savings');
    const key = `${user.id}:${input.idempotencyKey}`;
    const prior = await this.ledger.findByIdempotencyKey(key);
    if (prior) return prior;
    const goal = await this.prisma.savingsGoal.findFirst({ where: { id: goalId, userId: user.id, status: { not: 'CLOSED' } } });
    if (!goal) throw notFound('Savings goal');
    const savings = await this.prisma.ledgerAccount.findUniqueOrThrow({ where: { id: goal.accountId } });
    const wallet = await this.guard.ownedAccount(user.id, input.accountId);
    if (wallet.currency !== savings.currency) throw new AppError('VALIDATION', `Choose a ${savings.currency} account.`);
    this.guard.assertUserCanTransact(user);
    await this.guard.verifyPin(user, input.pin);
    const amount = toMoney(input.amount);
    const entry = await this.ledger.run((tx) =>
      this.ledger.post(tx, {
        type: 'SAVINGS_TRANSFER',
        description: direction === 'deposit' ? `Saved to “${goal.name}”` : `Withdrawn from “${goal.name}”`,
        category: 'Savings',
        legs:
          direction === 'deposit'
            ? [
                { accountId: wallet.id, amount: amount.negated() },
                { accountId: savings.id, amount },
              ]
            : [
                { accountId: savings.id, amount: amount.negated() },
                { accountId: wallet.id, amount },
              ],
        idempotencyKey: key,
        initiatorId: user.id,
        counterpartyName: goal.name,
      }),
    );
    const bal = new Decimal(savings.balance.toString()).plus(direction === 'deposit' ? amount : amount.negated());
    if (direction === 'deposit' && goal.status === 'ACTIVE' && bal.gte(goal.targetAmount.toString())) {
      await this.prisma.savingsGoal.update({ where: { id: goal.id }, data: { status: 'COMPLETED' } });
      await this.notifications.notify(user.id, {
        category: 'ACCOUNT',
        type: 'GOAL_REACHED',
        title: `Goal reached: ${goal.name} 🎯`,
        body: `You saved ${formatMoney(bal, savings.currency)}.`,
        link: '/app/savings',
        email: { template: 'savings-event', data: { subject: `You reached your “${goal.name}” goal`, message: `Congratulations! You have saved ${formatMoney(bal, savings.currency)}.` } },
      });
    }
    await this.notifications.balanceChanged(user.id);
    return entry;
  }

  async closeGoal(user: User, goalId: string) {
    const goal = await this.prisma.savingsGoal.findFirst({ where: { id: goalId, userId: user.id } });
    if (!goal) throw notFound('Savings goal');
    const acct = await this.prisma.ledgerAccount.findUniqueOrThrow({ where: { id: goal.accountId } });
    if (!new Decimal(acct.balance.toString()).isZero()) throw new AppError('CONFLICT', 'Withdraw the balance before closing this goal.');
    await this.prisma.$transaction([
      this.prisma.savingsGoal.update({ where: { id: goal.id }, data: { status: 'CLOSED' } }),
      this.prisma.ledgerAccount.update({ where: { id: acct.id }, data: { status: 'CLOSED' } }),
    ]);
    return { ok: true };
  }

  async createFixedDeposit(user: User, input: MoneyAuth & { fromAccountId: string; amount: number; tenorDays: number }) {
    await this.settings.assertFeature('savings');
    const key = `${user.id}:${input.idempotencyKey}`;
    const prior = await this.ledger.findByIdempotencyKey(key);
    if (prior) return prior;
    const from = await this.guard.ownedAccount(user.id, input.fromAccountId);
    const amount = toMoney(input.amount);
    const minUsd = await this.fx.toUsd(amount, from.currency);
    if (minUsd.lt(100)) throw new AppError('VALIDATION', 'The minimum fixed deposit is $100 (or equivalent).');
    this.guard.assertUserCanTransact(user);
    await this.guard.verifyPin(user, input.pin);
    const s = await this.settings.get();
    const rate = s.fixedDepositRates[String(input.tenorDays)];
    if (rate === undefined) throw new AppError('VALIDATION', 'Invalid tenor');
    const fd = await this.ledger.run(async (tx) => {
      const acct = await tx.ledgerAccount.create({ data: { type: 'FIXED_DEPOSIT', currency: from.currency, ownerId: user.id, name: `Fixed deposit · ${input.tenorDays} days` } });
      await this.ledger.post(tx, {
        type: 'SAVINGS_TRANSFER',
        description: `Fixed deposit · ${input.tenorDays} days @ ${rate}% p.a.`,
        category: 'Savings',
        legs: [
          { accountId: from.id, amount: amount.negated() },
          { accountId: acct.id, amount },
        ],
        idempotencyKey: key,
        initiatorId: user.id,
        counterpartyName: 'One Bank Fixed Deposit',
      });
      return tx.fixedDeposit.create({
        data: { userId: user.id, accountId: acct.id, sourceAccountId: from.id, principal: amount.toFixed(4), rate, tenorDays: input.tenorDays, currency: from.currency, maturesAt: new Date(Date.now() + input.tenorDays * 86_400_000) },
      });
    });
    await this.notifications.notify(user.id, { category: 'ACCOUNT', type: 'FD_CREATED', title: 'Fixed deposit created', body: `${formatMoney(amount, from.currency)} for ${input.tenorDays} days at ${rate}% p.a.`, link: '/app/savings', skipEmail: true });
    await this.notifications.balanceChanged(user.id);
    return fd;
  }

  /** Close a fixed deposit: at maturity (full interest) or early (pro-rata interest minus penalty). */
  async closeFixedDeposit(fdId: string, opts: { userId?: string; early: boolean }) {
    const fd = await this.prisma.fixedDeposit.findFirst({ where: { id: fdId, ...(opts.userId ? { userId: opts.userId } : {}) } });
    if (!fd || fd.status !== 'ACTIVE') throw notFound('Fixed deposit');
    const s = await this.settings.get();
    const principal = new Decimal(fd.principal.toString());
    const days = opts.early ? Math.floor((Date.now() - fd.startsAt.getTime()) / 86_400_000) : fd.tenorDays;
    let interest = toMoney(principal.mul(fd.rate.toString()).div(100).mul(days).div(365));
    let penalty = new Decimal(0);
    if (opts.early) {
      penalty = toMoney(principal.mul(s.fixedDepositPenaltyPercent).div(100));
      if (penalty.gt(interest)) {
        penalty = interest;
      }
      interest = interest.minus(penalty);
    }
    const target = await this.prisma.ledgerAccount.findUnique({ where: { id: fd.sourceAccountId } });
    const wallet =
      target && target.status !== 'CLOSED' ? target : await this.prisma.ledgerAccount.findFirstOrThrow({ where: { ownerId: fd.userId, type: 'CUSTOMER_WALLET', currency: fd.currency, status: { not: 'CLOSED' } } });
    await this.ledger.run(async (tx) => {
      await this.ledger.post(tx, {
        type: 'SAVINGS_TRANSFER',
        description: `Fixed deposit ${opts.early ? 'broken early' : 'matured'} — principal returned`,
        category: 'Savings',
        legs: [
          { accountId: fd.accountId, amount: principal.negated() },
          { accountId: wallet.id, amount: principal },
        ],
        initiatorType: opts.early ? 'USER' : 'SYSTEM',
        initiatorId: opts.userId,
        counterpartyName: 'One Bank Fixed Deposit',
      });
      if (interest.gt(0)) {
        await this.ledger.post(tx, {
          type: 'INTEREST',
          description: `Fixed deposit interest (${days} days @ ${fd.rate.toString()}%)${opts.early ? ' less early-withdrawal penalty' : ''}`,
          category: 'Income',
          legs: [
            { accountId: await this.ledger.systemAccountId('INTEREST_EXPENSE', fd.currency), amount: interest.negated() },
            { accountId: wallet.id, amount: interest },
          ],
          initiatorType: 'SYSTEM',
          counterpartyName: 'One Bank',
        });
      }
      await tx.ledgerAccount.update({ where: { id: fd.accountId }, data: { status: 'CLOSED' } });
      await tx.fixedDeposit.update({ where: { id: fd.id }, data: { status: opts.early ? 'BROKEN' : 'MATURED', interestPaid: interest.toFixed(4), closedAt: new Date() } });
    });
    await this.notifications.notify(fd.userId, {
      category: 'ACCOUNT',
      type: opts.early ? 'FD_BROKEN' : 'FD_MATURED',
      title: opts.early ? 'Fixed deposit closed' : 'Your fixed deposit has matured 🎉',
      body: `${formatMoney(principal.plus(interest), fd.currency)} returned to your account${penalty.gt(0) ? ` (penalty ${formatMoney(penalty, fd.currency)})` : ''}.`,
      link: '/app/savings',
      email: opts.early
        ? undefined
        : { template: 'savings-event', data: { subject: 'Your fixed deposit has matured', message: `Principal ${formatMoney(principal, fd.currency)} plus interest ${formatMoney(interest, fd.currency)} has been paid into your account.` } },
    });
    await this.notifications.balanceChanged(fd.userId);
    return { principal: principal.toFixed(2), interest: interest.toFixed(2), penalty: penalty.toFixed(2) };
  }

  /** Monthly savings interest: balance × rate / 12, paid into each savings goal. */
  async paySavingsInterest() {
    const s = await this.settings.get();
    const accts = await this.prisma.ledgerAccount.findMany({ where: { type: 'SAVINGS', status: 'ACTIVE', balance: { gt: 0 } } });
    let paid = 0;
    for (const a of accts) {
      const interest = toMoney(new Decimal(a.balance.toString()).mul(s.savingsRate).div(100).div(12));
      if (interest.lte(0)) continue;
      await this.ledger.run(async (tx) =>
        this.ledger.post(tx, {
          type: 'INTEREST',
          description: `Monthly savings interest @ ${s.savingsRate}% p.a.`,
          category: 'Income',
          legs: [
            { accountId: await this.ledger.systemAccountId('INTEREST_EXPENSE', a.currency), amount: interest.negated() },
            { accountId: a.id, amount: interest },
          ],
          initiatorType: 'SYSTEM',
          counterpartyName: 'One Bank',
        }),
      );
      if (a.ownerId) await this.notifications.notify(a.ownerId, { category: 'ACCOUNT', type: 'INTEREST', title: 'Interest paid', body: `${formatMoney(interest, a.currency)} added to ${a.name}`, link: '/app/savings', skipEmail: true });
      paid++;
    }
    return paid;
  }

  async runAutoSaves() {
    const due = await this.prisma.savingsGoal.findMany({ where: { status: 'ACTIVE', autoSaveFrequency: { not: 'NONE' }, nextAutoSaveAt: { lte: new Date() }, autoSaveAmount: { gt: 0 } }, include: { user: true } });
    for (const g of due) {
      const next = this.addPeriod(g.nextAutoSaveAt ?? new Date(), g.autoSaveFrequency);
      try {
        const source = g.autoSaveSourceId
          ? await this.prisma.ledgerAccount.findUniqueOrThrow({ where: { id: g.autoSaveSourceId } })
          : await this.prisma.ledgerAccount.findFirstOrThrow({ where: { ownerId: g.userId, type: 'CUSTOMER_WALLET', isPrimary: true } });
        const amount = toMoney(g.autoSaveAmount.toString());
        await this.ledger.run((tx) =>
          this.ledger.post(tx, {
            type: 'SAVINGS_TRANSFER',
            description: `Auto-save to “${g.name}”`,
            category: 'Savings',
            legs: [
              { accountId: source.id, amount: amount.negated() },
              { accountId: g.accountId, amount },
            ],
            initiatorType: 'SYSTEM',
            idempotencyKey: `autosave:${g.id}:${(g.nextAutoSaveAt ?? new Date()).toISOString()}`,
            counterpartyName: g.name,
          }),
        );
        await this.notifications.notify(g.userId, { category: 'ACCOUNT', type: 'AUTOSAVE', title: 'Auto-save complete', body: `${formatMoney(amount, source.currency)} saved to ${g.name}`, link: '/app/savings', skipEmail: true });
      } catch (e) {
        await this.notifications.notify(g.userId, { category: 'ACCOUNT', type: 'AUTOSAVE_FAILED', title: 'Auto-save skipped', body: `We could not move money to ${g.name}: ${e instanceof Error ? e.message : 'error'}`, link: '/app/savings' });
      }
      await this.prisma.savingsGoal.update({ where: { id: g.id }, data: { nextAutoSaveAt: next } });
    }
    return due.length;
  }

  async matureFixedDeposits() {
    const due = await this.prisma.fixedDeposit.findMany({ where: { status: 'ACTIVE', maturesAt: { lte: new Date() } } });
    for (const fd of due) await this.closeFixedDeposit(fd.id, { early: false });
    return due.length;
  }
}
