import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@prisma/client';
import {
  ENTRY_TYPE_LABELS,
  beneficiarySchema,
  billPaySchema,
  billValidateSchema,
  cardFundSchema,
  cardLimitSchema,
  createCardSchema,
  depositSchema,
  fixedDepositSchema,
  fxExchangeSchema,
  fxQuoteSchema,
  interbankTransferSchema,
  internalTransferSchema,
  kycSubmitSchema,
  loanApplySchema,
  loanRepaySchema,
  openWalletSchema,
  pinSchema,
  savingsGoalSchema,
  savingsMoveSchema,
  simulatePurchaseSchema,
  statementSchema,
  ticketCreateSchema,
  ticketReplySchema,
  wireTransferSchema,
  type EntryType,
} from '@onebank/shared';
import type { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { z } from 'zod';
import { AppError, notFound } from '../../common/app-error';
import { parse } from '../../common/http';
import { PrismaService } from '../../common/infra';
import { uploadOptions, uploadPath } from '../../common/uploads';
import { CurrentUser, SessionId, UserAuthGuard } from '../auth/guards';
import { FxService } from '../core/fx.service';
import { LedgerService } from '../core/ledger.service';
import { MoneyGuardService } from '../core/money-guard.service';
import { NotificationsService } from '../core/notifications.service';
import { SettingsService } from '../core/settings.service';
import { AccountsService, type TxFilter } from './accounts.service';
import { InsightsService } from './insights.service';
import { LoansService } from './loans.service';
import { PdfService } from './pdf.service';
import { ProductsService } from './products.service';
import { SupportService, type Upload } from './support.service';
import { TransfersService } from './transfers.service';

const MONEY_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@UseGuards(UserAuthGuard)
@Controller()
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly pdf: PdfService,
    private readonly insights: InsightsService,
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('accounts')
  summary(@CurrentUser() user: User) {
    return this.accounts.summary(user);
  }

  @Post('accounts')
  open(@CurrentUser() user: User, @Body() body: unknown) {
    return this.accounts.open(user, parse(openWalletSchema, body).currency);
  }

  @Throttle(MONEY_THROTTLE)
  @Post('accounts/deposit')
  deposit(@CurrentUser() user: User, @Body() body: unknown) {
    return this.accounts.deposit(user, parse(depositSchema, body));
  }

  @Get('accounts/lookup')
  async lookup(@Query('recipient') recipient: string) {
    if (!recipient) throw new AppError('VALIDATION', 'Enter an account number or @tag');
    const r = await this.accounts.lookup(recipient);
    return { name: r.name, accountNumber: r.accountNumber, currency: r.currency, currencies: r.currencies };
  }

  @Get('transactions')
  transactions(@CurrentUser() user: User, @Query() q: TxFilter) {
    return this.accounts.transactions(user.id, q);
  }

  @Get('transactions/export.csv')
  async exportCsv(@CurrentUser() user: User, @Query() q: TxFilter, @Res() res: Response) {
    const all = await this.accounts.transactions(user.id, { ...q, page: 1, pageSize: 100 });
    let rows = all.items;
    for (let p = 2; p <= Math.min(all.pages, 50); p++) rows = rows.concat((await this.accounts.transactions(user.id, { ...q, page: p, pageSize: 100 })).items);
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      ['Date', 'Reference', 'Type', 'Description', 'Counterparty', 'Account', 'Currency', 'Amount', 'Balance after', 'Status'].join(','),
      ...rows.map((r) =>
        [new Date(r.valueDate).toISOString(), r.reference, ENTRY_TYPE_LABELS[r.type as EntryType] ?? r.type, r.description, r.counterparty, r.accountNumber ?? r.accountName, r.currency, r.amount, r.balanceAfter, r.status].map(esc).join(','),
      ),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="onebank-transactions-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }

  @Get('transactions/:id')
  transaction(@CurrentUser() user: User, @Param('id') id: string) {
    return this.accounts.transaction(user.id, id);
  }

  @Get('transactions/:id/receipt')
  async receipt(@CurrentUser() user: User, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.pdf.receipt(user.id, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="onebank-receipt-${id}.pdf"`);
    res.send(pdf);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('statements')
  async statement(@CurrentUser() user: User, @Body() body: unknown, @Res() res: Response) {
    const input = parse(statementSchema, body);
    const s = await this.pdf.statement(user.id, input.accountId, input.from, input.to);
    if (input.email) {
      await this.notifications.notify(user.id, {
        category: 'ACCOUNT',
        type: 'STATEMENT',
        title: 'Statement sent',
        body: `Your statement for ${s.period} was emailed to you.`,
        email: { template: 'statement', data: { period: s.period, accountNumber: s.accountNumber }, attachments: [{ filename: s.filename, content: s.pdf.toString('base64'), contentType: 'application/pdf' }] },
      });
      res.json({ emailed: true });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${s.filename}"`);
    res.send(s.pdf);
  }

  @Get('analytics')
  analytics(@CurrentUser() user: User, @Query('months') months?: string) {
    return this.insights.analytics(user, Math.min(12, Math.max(1, Number(months ?? 6))));
  }

  @Get('dashboard')
  async dashboard(@CurrentUser() user: User) {
    const [summary, recent, insights, goals, cards, unread] = await Promise.all([
      this.accounts.summary(user),
      this.accounts.transactions(user.id, { pageSize: 6 }),
      this.insights.analytics(user, 6),
      this.prisma.savingsGoal.findMany({ where: { userId: user.id, status: { not: 'CLOSED' } }, take: 3, orderBy: { createdAt: 'desc' } }),
      this.prisma.virtualCard.count({ where: { userId: user.id, status: { not: 'TERMINATED' } } }),
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    const goalAccts = await this.prisma.ledgerAccount.findMany({ where: { id: { in: goals.map((g) => g.accountId) } } });
    return {
      summary,
      recent: recent.items,
      insights,
      goals: goals.map((g) => {
        const a = goalAccts.find((x) => x.id === g.accountId)!;
        return { id: g.id, name: g.name, currency: a.currency, balance: a.balance.toFixed(2), target: g.targetAmount.toFixed(2) };
      }),
      cardCount: cards,
      unreadNotifications: unread,
    };
  }
}

@UseGuards(UserAuthGuard)
@Controller('transfers')
export class TransfersController {
  constructor(
    private readonly transfers: TransfersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('banks')
  banks(@Query('country') country?: string) {
    return this.transfers.banks(country);
  }

  @Get('name-enquiry')
  nameEnquiry(@Query('bankCode') bankCode: string, @Query('accountNumber') accountNumber: string) {
    return this.transfers.nameEnquiry(bankCode, accountNumber);
  }

  @Throttle(MONEY_THROTTLE)
  @Post('internal')
  internal(@CurrentUser() user: User, @SessionId() sid: string, @Body() body: unknown) {
    return this.transfers.internal(user, parse(internalTransferSchema, body), { sessionId: sid });
  }

  @Throttle(MONEY_THROTTLE)
  @Post('interbank')
  interbank(@CurrentUser() user: User, @SessionId() sid: string, @Body() body: unknown) {
    return this.transfers.interbank(user, parse(interbankTransferSchema, body), { sessionId: sid });
  }

  @Throttle(MONEY_THROTTLE)
  @Post('wire')
  wire(@CurrentUser() user: User, @SessionId() sid: string, @Body() body: unknown) {
    return this.transfers.wire(user, parse(wireTransferSchema, body), { sessionId: sid });
  }

  @Get('scheduled')
  scheduled(@CurrentUser() user: User) {
    return this.prisma.scheduledTransfer.findMany({ where: { userId: user.id }, orderBy: [{ active: 'desc' }, { nextRunAt: 'asc' }] });
  }

  @Delete('scheduled/:id')
  async cancelScheduled(@CurrentUser() user: User, @Param('id') id: string) {
    const r = await this.prisma.scheduledTransfer.updateMany({ where: { id, userId: user.id }, data: { active: false } });
    if (!r.count) throw notFound('Scheduled transfer');
    return { ok: true };
  }

  @Get('beneficiaries')
  beneficiaries(@CurrentUser() user: User) {
    return this.prisma.beneficiary.findMany({ where: { userId: user.id }, orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }] });
  }

  @Post('beneficiaries')
  addBeneficiary(@CurrentUser() user: User, @Body() body: unknown) {
    const b = parse(beneficiarySchema, body);
    return this.transfers.saveBeneficiary(user.id, { ...b, type: b.type });
  }

  @Patch('beneficiaries/:id')
  async renameBeneficiary(@CurrentUser() user: User, @Param('id') id: string, @Body() body: unknown) {
    const { nickname } = parse(z.object({ nickname: z.string().max(40) }), body);
    const r = await this.prisma.beneficiary.updateMany({ where: { id, userId: user.id }, data: { nickname } });
    if (!r.count) throw notFound('Beneficiary');
    return { ok: true };
  }

  @Delete('beneficiaries/:id')
  async deleteBeneficiary(@CurrentUser() user: User, @Param('id') id: string) {
    const r = await this.prisma.beneficiary.deleteMany({ where: { id, userId: user.id } });
    if (!r.count) throw notFound('Beneficiary');
    return { ok: true };
  }
}

@UseGuards(UserAuthGuard)
@Controller('fx')
export class FxController {
  constructor(
    private readonly fx: FxService,
    private readonly ledger: LedgerService,
    private readonly guard: MoneyGuardService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  @Post('quote')
  async quote(@CurrentUser() user: User, @Body() body: unknown) {
    await this.settings.assertFeature('fx');
    const q = parse(fxQuoteSchema, body);
    return this.fx.quote(q.from, q.to, q.amount, user.id);
  }

  @Throttle(MONEY_THROTTLE)
  @Post('exchange')
  async exchange(@CurrentUser() user: User, @Body() body: unknown) {
    await this.settings.assertFeature('fx');
    const input = parse(fxExchangeSchema, body);
    const key = `${user.id}:${input.idempotencyKey}`;
    const prior = await this.ledger.findByIdempotencyKey(key);
    if (prior) return prior;
    const from = await this.guard.ownedAccount(user.id, input.fromAccountId);
    const to = await this.guard.ownedAccount(user.id, input.toAccountId);
    const q = await this.fx.consumeQuote(user.id, input.quoteId);
    if (q.from !== from.currency || q.to !== to.currency || Number(q.amount) !== input.amount) throw new AppError('CONFLICT', 'Quote does not match this exchange. Please get a new quote.');
    await this.guard.authorize(user, { amount: q.amount, currency: from.currency, pin: input.pin, otp: input.otp });
    const entry = await this.ledger.run(async (tx) =>
      this.ledger.post(tx, {
        type: 'FX',
        description: `Exchanged ${from.currency} to ${to.currency}`,
        category: 'Exchange',
        legs: [
          { accountId: from.id, amount: `-${q.amount}` },
          { accountId: await this.ledger.systemAccountId('FX_POOL', from.currency), amount: q.amount },
          { accountId: await this.ledger.systemAccountId('FX_POOL', to.currency), amount: `-${q.converted}` },
          { accountId: to.id, amount: q.converted },
        ],
        idempotencyKey: key,
        initiatorId: user.id,
        counterpartyName: 'One Bank FX',
        metadata: { fx: { rate: q.rate, from: q.from, to: q.to, converted: q.converted, mid: q.midRate } },
      }),
    );
    await this.notifications.notify(user.id, { category: 'TRANSACTIONS', type: 'FX', title: 'Exchange complete', body: `${q.amount} ${q.from} → ${q.converted} ${q.to}`, link: `/app/transactions/${entry.id}`, skipEmail: true });
    await this.notifications.balanceChanged(user.id);
    return entry;
  }
}

@UseGuards(UserAuthGuard)
@Controller()
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly guard: MoneyGuardService,
  ) {}

  // ----- bills -----
  @Get('bills/providers')
  providers(@Query('category') category?: string) {
    return this.products.billProviders(category);
  }

  @Post('bills/validate')
  validate(@Body() body: unknown) {
    const i = parse(billValidateSchema, body);
    return this.products.validateBillCustomer(i.providerId, i.customerId);
  }

  @Throttle(MONEY_THROTTLE)
  @Post('bills/pay')
  pay(@CurrentUser() user: User, @Body() body: unknown) {
    return this.products.payBill(user, parse(billPaySchema, body));
  }

  // ----- cards -----
  @Get('cards')
  cards(@CurrentUser() user: User) {
    return this.products.cards(user.id);
  }

  @Throttle(MONEY_THROTTLE)
  @Post('cards')
  createCard(@CurrentUser() user: User, @Body() body: unknown) {
    return this.products.createCard(user, parse(createCardSchema, body));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('cards/:id/reveal')
  reveal(@CurrentUser() user: User, @Param('id') id: string, @Body() body: unknown) {
    return this.products.revealCard(user, id, parse(z.object({ pin: pinSchema }), body).pin);
  }

  @Throttle(MONEY_THROTTLE)
  @Post('cards/:id/fund')
  fund(@CurrentUser() user: User, @Param('id') id: string, @Body() body: unknown) {
    return this.products.fundCard(user, id, parse(cardFundSchema, body), 'fund');
  }

  @Throttle(MONEY_THROTTLE)
  @Post('cards/:id/withdraw')
  withdraw(@CurrentUser() user: User, @Param('id') id: string, @Body() body: unknown) {
    return this.products.fundCard(user, id, parse(cardFundSchema, body), 'withdraw');
  }

  @HttpCode(200)
  @Post('cards/:id/freeze')
  freeze(@CurrentUser() user: User, @Param('id') id: string) {
    return this.products.setCardStatus(user, id, 'freeze');
  }

  @HttpCode(200)
  @Post('cards/:id/unfreeze')
  unfreeze(@CurrentUser() user: User, @Param('id') id: string) {
    return this.products.setCardStatus(user, id, 'unfreeze');
  }

  @Patch('cards/:id/limit')
  limit(@CurrentUser() user: User, @Param('id') id: string, @Body() body: unknown) {
    return this.products.setCardLimit(user, id, parse(cardLimitSchema, body).spendLimit);
  }

  @HttpCode(200)
  @Post('cards/:id/terminate')
  terminate(@CurrentUser() user: User, @Param('id') id: string, @Body() body: unknown) {
    return this.products.terminateCard(user, id, parse(z.object({ pin: pinSchema }), body).pin);
  }

  @Throttle(MONEY_THROTTLE)
  @HttpCode(200)
  @Post('cards/:id/simulate-purchase')
  simulate(@CurrentUser() user: User, @Param('id') id: string, @Body() body: unknown) {
    return this.products.simulatePurchase(user.id, id, parse(simulatePurchaseSchema, body));
  }

  @Get('cards/:id/transactions')
  cardTx(@CurrentUser() user: User, @Param('id') id: string) {
    return this.products.cardTransactions(user.id, id);
  }

  // ----- savings -----
  @Get('savings')
  savings(@CurrentUser() user: User) {
    return this.products.savingsOverview(user.id);
  }

  @Post('savings/goals')
  createGoal(@CurrentUser() user: User, @Body() body: unknown) {
    return this.products.createGoal(user, parse(savingsGoalSchema, body));
  }

  @Throttle(MONEY_THROTTLE)
  @Post('savings/goals/:id/deposit')
  goalDeposit(@CurrentUser() user: User, @Param('id') id: string, @Body() body: unknown) {
    return this.products.moveSavings(user, id, parse(savingsMoveSchema, body), 'deposit');
  }

  @Throttle(MONEY_THROTTLE)
  @Post('savings/goals/:id/withdraw')
  goalWithdraw(@CurrentUser() user: User, @Param('id') id: string, @Body() body: unknown) {
    return this.products.moveSavings(user, id, parse(savingsMoveSchema, body), 'withdraw');
  }

  @Delete('savings/goals/:id')
  closeGoal(@CurrentUser() user: User, @Param('id') id: string) {
    return this.products.closeGoal(user, id);
  }

  @Throttle(MONEY_THROTTLE)
  @Post('savings/fixed-deposits')
  createFd(@CurrentUser() user: User, @Body() body: unknown) {
    return this.products.createFixedDeposit(user, parse(fixedDepositSchema, body));
  }

  @HttpCode(200)
  @Post('savings/fixed-deposits/:id/break')
  async breakFd(@CurrentUser() user: User, @Param('id') id: string, @Body() body: unknown) {
    const { pin } = parse(z.object({ pin: pinSchema }), body);
    this.guard.assertUserCanTransact(user);
    await this.guard.verifyPin(user, pin);
    return this.products.closeFixedDeposit(id, { userId: user.id, early: true });
  }
}

@UseGuards(UserAuthGuard)
@Controller('loans')
export class LoansController {
  constructor(
    private readonly loans: LoansService,
    private readonly guard: MoneyGuardService,
  ) {}

  @Get('products')
  products() {
    return this.loans.products();
  }

  @Get('quote')
  quote(@Query('rate') rate: string, @Query('amount') amount: string, @Query('months') months: string) {
    return this.loans.quote(rate, Number(amount), Number(months));
  }

  @Get()
  list(@CurrentUser() user: User) {
    return this.loans.list(user.id);
  }

  @Post()
  apply(@CurrentUser() user: User, @Body() body: unknown) {
    return this.loans.apply(user, parse(loanApplySchema, body));
  }

  @Throttle(MONEY_THROTTLE)
  @HttpCode(200)
  @Post(':id/repay')
  repay(@CurrentUser() user: User, @Param('id') id: string, @Body() body: unknown) {
    return this.loans.repay(user, id, parse(loanRepaySchema, body));
  }
}

@UseGuards(UserAuthGuard)
@Controller('support')
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('tickets')
  list(@CurrentUser() user: User) {
    return this.support.list(user.id);
  }

  @Get('tickets/:id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.support.get(user.id, id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('tickets')
  @UseInterceptors(FilesInterceptor('files', 3, uploadOptions('tickets')))
  create(@CurrentUser() user: User, @Body() body: Record<string, unknown>, @UploadedFiles() files: Upload[] = []) {
    return this.support.create(user, parse(ticketCreateSchema, body), files);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('tickets/:id/messages')
  @UseInterceptors(FilesInterceptor('files', 3, uploadOptions('tickets')))
  reply(@CurrentUser() user: User, @Param('id') id: string, @Body() body: Record<string, unknown>, @UploadedFiles() files: Upload[] = []) {
    return this.support.reply(user, id, parse(ticketReplySchema, body).message, files);
  }

  @HttpCode(200)
  @Post('tickets/:id/close')
  close(@CurrentUser() user: User, @Param('id') id: string) {
    return this.support.setStatus(user, id, 'CLOSED');
  }

  @HttpCode(200)
  @Post('tickets/:id/reopen')
  reopen(@CurrentUser() user: User, @Param('id') id: string) {
    return this.support.setStatus(user, id, 'OPEN');
  }

  @Get('attachments/:file')
  async attachment(@CurrentUser() user: User, @Param('file') file: string, @Res() res: Response) {
    const msg = await this.prisma.ticketMessage.findFirst({
      where: { ticket: { userId: user.id }, internal: false, attachments: { array_contains: [{ file }] } },
    });
    const path = uploadPath('tickets', file);
    if (!msg || !existsSync(path)) throw notFound('File');
    createReadStream(path).pipe(res);
  }
}

@UseGuards(UserAuthGuard)
@Controller('kyc')
export class KycController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  async status(@CurrentUser() user: User) {
    const submissions = await this.prisma.kycSubmission.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 10 });
    return { kycLevel: user.kycLevel, submissions: submissions.map(({ documentPath: _d, selfiePath: _s, ...rest }) => rest) };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'document', maxCount: 1 }, { name: 'selfie', maxCount: 1 }], uploadOptions('kyc')))
  async submit(@CurrentUser() user: User, @Body() body: Record<string, unknown>, @UploadedFiles() files: { document?: Upload[]; selfie?: Upload[] }) {
    const input = parse(kycSubmitSchema, body);
    if (user.status !== 'ACTIVE') throw new AppError('ACCOUNT_SUSPENDED', 'Your account must be active to submit verification.');
    if (input.level <= user.kycLevel) throw new AppError('CONFLICT', `You are already at level ${user.kycLevel}.`);
    if (input.level > user.kycLevel + 1) throw new AppError('VALIDATION', `Complete level ${user.kycLevel + 1} first.`);
    const doc = files?.document?.[0];
    if (!doc) throw new AppError('VALIDATION', 'Please upload your document.');
    if (input.level === 2 && !files?.selfie?.[0]) throw new AppError('VALIDATION', 'Please upload a selfie holding your ID.');
    const pending = await this.prisma.kycSubmission.findFirst({ where: { userId: user.id, status: 'PENDING' } });
    if (pending) throw new AppError('CONFLICT', 'You already have a verification under review.');
    const sub = await this.prisma.kycSubmission.create({
      data: { userId: user.id, level: input.level, idType: input.idType, idNumber: input.idNumber, documentPath: doc.filename, selfiePath: files.selfie?.[0]?.filename },
    });
    await this.notifications.notify(user.id, { category: 'ACCOUNT', type: 'KYC_SUBMITTED', title: 'Verification submitted', body: 'We are reviewing your documents. This usually takes less than 24 hours.', link: '/app/settings/kyc', skipEmail: true });
    return { id: sub.id, status: sub.status };
  }
}
