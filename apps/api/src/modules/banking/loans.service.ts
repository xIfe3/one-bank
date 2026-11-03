import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { formatMoney, toMoney } from '@onebank/shared';
import Decimal from 'decimal.js';
import { AppError, notFound } from '../../common/app-error';
import { PrismaService } from '../../common/infra';
import { AuditService } from '../core/audit.service';
import { LedgerService } from '../core/ledger.service';
import { MoneyGuardService } from '../core/money-guard.service';
import { NotificationsService } from '../core/notifications.service';
import { SettingsService } from '../core/settings.service';

/** Amortised (equal-instalment) schedule: P·r / (1 − (1+r)^−n), r = monthly rate. */
export function amortise(principal: Decimal.Value, annualRatePct: Decimal.Value, months: number) {
  const P = new Decimal(principal);
  const r = new Decimal(annualRatePct).div(100).div(12);
  const instalment = r.isZero() ? P.div(months) : P.mul(r).div(new Decimal(1).minus(new Decimal(1).plus(r).pow(-months)));
  const inst = toMoney(instalment);
  const total = inst.mul(months);
  return { instalment: inst, total: toMoney(total), interest: toMoney(total.minus(P)) };
}

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly guard: MoneyGuardService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  products() {
    return this.prisma.loanProduct.findMany({ where: { active: true }, orderBy: { maxAmount: 'asc' } });
  }

  quote(productRate: Decimal.Value, amount: number, months: number) {
    const q = amortise(amount, productRate, months);
    return { instalment: q.instalment.toFixed(2), totalRepayable: q.total.toFixed(2), totalInterest: q.interest.toFixed(2) };
  }

  async list(userId: string) {
    const loans = await this.prisma.loan.findMany({ where: { userId }, include: { product: true, repayments: { orderBy: { dueDate: 'asc' } } }, orderBy: { createdAt: 'desc' } });
    return loans.map((l) => this.dto(l));
  }

  dto(l: { principal: Decimal.Value | { toString(): string }; totalRepayable: { toString(): string }; amountRepaid: { toString(): string }; interestRate: { toString(): string }; repayments?: { amountDue: { toString(): string }; amountPaid: { toString(): string }; lateFee: { toString(): string } }[] } & Record<string, unknown>) {
    const outstanding = new Decimal(l.totalRepayable.toString()).minus(l.amountRepaid.toString());
    return {
      ...l,
      principal: new Decimal(l.principal.toString()).toFixed(2),
      totalRepayable: new Decimal(l.totalRepayable.toString()).toFixed(2),
      amountRepaid: new Decimal(l.amountRepaid.toString()).toFixed(2),
      interestRate: new Decimal(l.interestRate.toString()).toFixed(2),
      outstanding: Decimal.max(0, outstanding).toFixed(2),
      repayments: l.repayments?.map((r) => ({ ...r, amountDue: new Decimal(r.amountDue.toString()).toFixed(2), amountPaid: new Decimal(r.amountPaid.toString()).toFixed(2), lateFee: new Decimal(r.lateFee.toString()).toFixed(2) })),
    };
  }

  async apply(user: User, input: { productId: string; accountId: string; amount: number; tenorMonths: number; purpose: string }) {
    await this.settings.assertFeature('loans');
    this.guard.assertUserCanTransact(user);
    const product = await this.prisma.loanProduct.findUnique({ where: { id: input.productId } });
    if (!product || !product.active) throw notFound('Loan product');
    if (user.kycLevel < product.minKycLevel) throw new AppError('KYC_REQUIRED', `This loan requires verification level ${product.minKycLevel}.`);
    const acct = await this.guard.ownedAccount(user.id, input.accountId);
    if (acct.currency !== product.currency) throw new AppError('VALIDATION', `This loan is paid out in ${product.currency}. Choose a ${product.currency} account.`);
    if (new Decimal(input.amount).lt(product.minAmount.toString()) || new Decimal(input.amount).gt(product.maxAmount.toString())) {
      throw new AppError('VALIDATION', `Amount must be between ${formatMoney(product.minAmount.toString(), product.currency)} and ${formatMoney(product.maxAmount.toString(), product.currency)}.`);
    }
    if (input.tenorMonths < product.minTenorMonths || input.tenorMonths > product.maxTenorMonths) {
      throw new AppError('VALIDATION', `Tenor must be ${product.minTenorMonths}–${product.maxTenorMonths} months.`);
    }
    const open = await this.prisma.loan.findFirst({ where: { userId: user.id, status: { in: ['APPLIED', 'APPROVED', 'DISBURSED'] } } });
    if (open) throw new AppError('CONFLICT', 'You already have an active loan or pending application.');
    const q = amortise(input.amount, product.interestRate.toString(), input.tenorMonths);
    const loan = await this.prisma.loan.create({
      data: {
        userId: user.id,
        productId: product.id,
        disburseAccountId: acct.id,
        principal: toMoney(input.amount).toFixed(4),
        interestRate: product.interestRate,
        tenorMonths: input.tenorMonths,
        totalRepayable: q.total.toFixed(4),
        currency: product.currency,
        purpose: input.purpose,
      },
    });
    await this.notifications.notify(user.id, {
      category: 'ACCOUNT',
      type: 'LOAN_APPLIED',
      title: 'Loan application received',
      body: `${formatMoney(input.amount, product.currency)} ${product.name} — we will review it shortly.`,
      link: '/app/loans',
      skipEmail: true,
    });
    return loan;
  }

  async approve(loanId: string, adminId: string, note?: string) {
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId }, include: { product: true } });
    if (!loan) throw notFound('Loan');
    if (loan.status !== 'APPLIED') throw new AppError('CONFLICT', `Loan is ${loan.status.toLowerCase()}`);
    const q = amortise(loan.principal.toString(), loan.interestRate.toString(), loan.tenorMonths);
    await this.ledger.run(async (tx) => {
      const principal = new Decimal(loan.principal.toString());
      await this.ledger.post(tx, {
        type: 'LOAN_DISBURSE',
        description: `${loan.product.name} disbursement`,
        category: 'Income',
        legs: [
          { accountId: await this.ledger.systemAccountId('LOAN_PORTFOLIO', loan.currency), amount: principal.negated() },
          { accountId: loan.disburseAccountId, amount: principal },
        ],
        initiatorType: 'ADMIN',
        initiatorId: adminId,
        counterpartyName: 'One Bank Loans',
        metadata: { loanId: loan.id },
      });
      const now = new Date();
      await tx.loanRepayment.createMany({
        data: Array.from({ length: loan.tenorMonths }, (_, i) => {
          const due = new Date(now);
          due.setMonth(due.getMonth() + i + 1);
          const isLast = i === loan.tenorMonths - 1;
          const amount = isLast ? q.total.minus(q.instalment.mul(loan.tenorMonths - 1)) : q.instalment;
          return { loanId: loan.id, dueDate: due, amountDue: amount.toFixed(4) };
        }),
      });
      await tx.loan.update({ where: { id: loan.id }, data: { status: 'DISBURSED', decidedById: adminId, decisionNote: note, disbursedAt: now, totalRepayable: q.total.toFixed(4) } });
    });
    await this.audit.log({ type: 'ADMIN', id: adminId }, 'loan.approve', { type: 'Loan', id: loan.id }, { reason: note });
    const amt = formatMoney(loan.principal.toString(), loan.currency);
    await this.notifications.notify(loan.userId, {
      category: 'ACCOUNT',
      type: 'LOAN_DISBURSED',
      title: 'Loan approved and disbursed 🎉',
      body: `${amt} has been paid into your account. First repayment of ${formatMoney(q.instalment, loan.currency)} is due in one month.`,
      link: '/app/loans',
      email: {
        template: 'loan-event',
        data: {
          subject: 'Your loan has been approved',
          tone: 'success',
          message: `Great news — your ${loan.product.name} of ${amt} has been approved and paid into your account.`,
          rows: [
            ['Monthly instalment', formatMoney(q.instalment, loan.currency)],
            ['Tenor', `${loan.tenorMonths} months`],
            ['Total repayable', formatMoney(q.total, loan.currency)],
          ],
        },
      },
    });
    await this.notifications.balanceChanged(loan.userId);
  }

  async reject(loanId: string, adminId: string, note: string) {
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId }, include: { product: true } });
    if (!loan || loan.status !== 'APPLIED') throw new AppError('CONFLICT', 'Loan is not pending');
    await this.prisma.loan.update({ where: { id: loanId }, data: { status: 'REJECTED', decidedById: adminId, decisionNote: note } });
    await this.audit.log({ type: 'ADMIN', id: adminId }, 'loan.reject', { type: 'Loan', id: loanId }, { reason: note });
    await this.notifications.notify(loan.userId, {
      category: 'ACCOUNT',
      type: 'LOAN_REJECTED',
      title: 'Loan application update',
      body: `Your ${loan.product.name} application was not approved. ${note}`,
      link: '/app/loans',
      email: { template: 'loan-event', data: { subject: 'Update on your loan application', tone: 'alert', message: `We are unable to approve your ${loan.product.name} application at this time. Reason: ${note}` } },
    });
  }

  /** Pay towards the loan: allocates to the oldest unpaid instalments first. */
  async repay(user: User | null, loanId: string, input: { accountId?: string; amount?: number; pin?: string; idempotencyKey?: string }, opts: { system?: boolean } = {}) {
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId }, include: { repayments: { orderBy: { dueDate: 'asc' } }, product: true } });
    if (!loan || (user && loan.userId !== user.id)) throw notFound('Loan');
    if (loan.status !== 'DISBURSED' && loan.status !== 'DEFAULTED') throw new AppError('CONFLICT', 'This loan is not active.');
    const owner = user ?? (await this.prisma.user.findUniqueOrThrow({ where: { id: loan.userId } }));
    if (!opts.system) {
      this.guard.assertUserCanTransact(owner);
      await this.guard.verifyPin(owner, input.pin ?? '');
    }
    const source = input.accountId ? await this.guard.ownedAccount(owner.id, input.accountId) : await this.prisma.ledgerAccount.findUniqueOrThrow({ where: { id: loan.disburseAccountId } });
    if (source.currency !== loan.currency) throw new AppError('VALIDATION', `Repay from a ${loan.currency} account.`);
    const outstanding = loan.repayments.reduce((s, r) => s.plus(r.amountDue.toString()).plus(r.lateFee.toString()).minus(r.amountPaid.toString()), new Decimal(0));
    let amount = toMoney(input.amount ?? outstanding);
    if (amount.gt(outstanding)) amount = outstanding;
    if (amount.lte(0)) throw new AppError('VALIDATION', 'Nothing to repay.');
    const key = input.idempotencyKey ? `${owner.id}:${input.idempotencyKey}` : undefined;

    await this.ledger.run(async (tx) => {
      await this.ledger.post(tx, {
        type: 'LOAN_REPAY',
        description: `${loan.product.name} repayment`,
        category: 'Loans',
        legs: [
          { accountId: source.id, amount: amount.negated() },
          { accountId: await this.ledger.systemAccountId('LOAN_PORTFOLIO', loan.currency), amount },
        ],
        idempotencyKey: key,
        initiatorType: opts.system ? 'SYSTEM' : 'USER',
        initiatorId: opts.system ? undefined : owner.id,
        counterpartyName: 'One Bank Loans',
        metadata: { loanId: loan.id },
      });
      let left = amount;
      for (const r of loan.repayments) {
        if (left.lte(0)) break;
        const due = new Decimal(r.amountDue.toString()).plus(r.lateFee.toString()).minus(r.amountPaid.toString());
        if (due.lte(0)) continue;
        const pay = Decimal.min(due, left);
        left = left.minus(pay);
        const paidAll = pay.eq(due);
        await tx.loanRepayment.update({ where: { id: r.id }, data: { amountPaid: new Decimal(r.amountPaid.toString()).plus(pay).toFixed(4), status: paidAll ? 'PAID' : r.status, paidAt: paidAll ? new Date() : r.paidAt } });
      }
      const repaid = new Decimal(loan.amountRepaid.toString()).plus(amount);
      const done = outstanding.minus(amount).lte(0);
      await tx.loan.update({ where: { id: loan.id }, data: { amountRepaid: repaid.toFixed(4), status: done ? 'REPAID' : loan.status } });
    });
    const done = outstanding.minus(amount).lte(0);
    await this.notifications.notify(owner.id, {
      category: 'ACCOUNT',
      type: done ? 'LOAN_REPAID' : 'LOAN_REPAYMENT',
      title: done ? 'Loan fully repaid 🎉' : 'Loan repayment received',
      body: `${formatMoney(amount, loan.currency)} paid towards your ${loan.product.name}.`,
      link: '/app/loans',
      email: done ? { template: 'loan-event', data: { subject: 'Your loan is fully repaid', tone: 'success', message: `Congratulations — your ${loan.product.name} is fully repaid.` } } : undefined,
    });
    await this.notifications.balanceChanged(owner.id);
    return { paid: amount.toFixed(2), outstanding: outstanding.minus(amount).toFixed(2) };
  }

  /** Daily job: auto-debit due instalments; apply late fee once if unpaid. */
  async processDueRepayments() {
    const due = await this.prisma.loanRepayment.findMany({ where: { status: { in: ['DUE', 'LATE'] }, dueDate: { lte: new Date() } }, include: { loan: { include: { product: true } } }, take: 100 });
    for (const r of due) {
      if (r.loan.status !== 'DISBURSED') continue;
      const remaining = new Decimal(r.amountDue.toString()).plus(r.lateFee.toString()).minus(r.amountPaid.toString());
      const wallet = await this.prisma.ledgerAccount.findUnique({ where: { id: r.loan.disburseAccountId } });
      const available = new Decimal(wallet?.availableBalance.toString() ?? 0);
      if (wallet && wallet.status === 'ACTIVE' && available.gte(remaining)) {
        await this.repay(null, r.loanId, { amount: remaining.toNumber() }, { system: true }).catch(() => undefined);
      } else if (r.status === 'DUE') {
        const fee = toMoney(new Decimal(r.amountDue.toString()).mul(r.loan.product.lateFeePercent.toString()).div(100));
        await this.prisma.$transaction([
          this.prisma.loanRepayment.update({ where: { id: r.id }, data: { status: 'LATE', lateFee: fee.toFixed(4) } }),
          this.prisma.loan.update({ where: { id: r.loanId }, data: { totalRepayable: { increment: fee.toFixed(4) } } }),
        ]);
        await this.notifications.notify(r.loan.userId, {
          category: 'ACCOUNT',
          type: 'LOAN_MISSED',
          title: 'Loan repayment missed',
          body: `We could not collect ${formatMoney(remaining, r.loan.currency)}. A late fee of ${formatMoney(fee, r.loan.currency)} was added.`,
          link: '/app/loans',
          email: { template: 'loan-event', data: { subject: 'Missed loan repayment', tone: 'alert', message: `We could not collect your instalment of ${formatMoney(remaining, r.loan.currency)} due to insufficient funds. A late fee of ${formatMoney(fee, r.loan.currency)} has been applied. Please fund your account.` } },
        });
      }
    }
    return due.length;
  }

  async markDefaulted(loanId: string, adminId: string, reason: string) {
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan || loan.status !== 'DISBURSED') throw new AppError('CONFLICT', 'Only active loans can be marked defaulted.');
    await this.prisma.loan.update({ where: { id: loanId }, data: { status: 'DEFAULTED', decisionNote: reason } });
    await this.audit.log({ type: 'ADMIN', id: adminId }, 'loan.default', { type: 'Loan', id: loanId }, { reason });
  }
}
