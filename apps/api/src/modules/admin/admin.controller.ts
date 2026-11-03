import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { AdminUser, Prisma } from '@prisma/client';
import {
  adminAdjustSchema,
  adminBroadcastSchema,
  adminCustomTransactionSchema,
  adminInviteSchema,
  adminNotifySchema,
  adminReasonSchema,
  adminSettingsSchema,
  announcementSchema,
  simulatePurchaseSchema,
  ticketReplySchema,
  updateProfileSchema,
} from '@onebank/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../../config';
import { AppError, notFound } from '../../common/app-error';
import { clientIp, parse } from '../../common/http';
import { PrismaService } from '../../common/infra';
import { sendUpload, uploadOptions } from '../../common/uploads';
import { AuthService } from '../auth/auth.service';
import { AdminAuthGuard, CurrentAdmin, Roles, SessionId } from '../auth/guards';
import { SessionService } from '../auth/session.service';
import { AccountsService, type TxFilter } from '../banking/accounts.service';
import { InsightsService } from '../banking/insights.service';
import { LoansService } from '../banking/loans.service';
import { PdfService } from '../banking/pdf.service';
import { ProductsService } from '../banking/products.service';
import { SupportService, type Upload } from '../banking/support.service';
import { TransfersService } from '../banking/transfers.service';
import { AuditService } from '../core/audit.service';
import { LedgerService, SYSTEM_CODES } from '../core/ledger.service';
import { MailService } from '../core/mail.service';
import { MoneyGuardService } from '../core/money-guard.service';
import { NotificationsService } from '../core/notifications.service';
import { SettingsService } from '../core/settings.service';
import { publicUser } from '../me/me.controller';
import { publicAdmin } from './admin-auth.controller';
import { AdminService } from './admin.service';

const page = (q: { page?: string; pageSize?: string }) => {
  const p = Math.max(1, Number(q.page ?? 1));
  const size = Math.min(100, Math.max(5, Number(q.pageSize ?? 25)));
  return { skip: (p - 1) * size, take: size, page: p, pageSize: size };
};
const paged = <T>(items: T[], total: number, p: { page: number; pageSize: number }) => ({ items, total, page: p.page, pageSize: p.pageSize, pages: Math.max(1, Math.ceil(total / p.pageSize)) });

// =====================================================================
// Overview & users
// =====================================================================

@UseGuards(AdminAuthGuard)
@Controller('admin')
export class AdminOverviewController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('activity')
  activity() {
    return this.admin.activity();
  }
}

@UseGuards(AdminAuthGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminService,
    private readonly sessions: SessionService,
    private readonly accounts: AccountsService,
    private readonly insights: InsightsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly auth: AuthService,
    private readonly guard: MoneyGuardService,
    private readonly mail: MailService,
  ) {}

  @Get()
  async list(@Query() q: { q?: string; status?: string; kycLevel?: string; country?: string; page?: string; pageSize?: string; sort?: string }) {
    const p = page(q);
    const where: Prisma.UserWhereInput = {
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.kycLevel ? { kycLevel: Number(q.kycLevel) } : {}),
      ...(q.country ? { country: q.country } : {}),
      ...(q.q
        ? {
            OR: [
              { email: { contains: q.q, mode: 'insensitive' } },
              { firstName: { contains: q.q, mode: 'insensitive' } },
              { lastName: { contains: q.q, mode: 'insensitive' } },
              { phone: { contains: q.q } },
              { tag: { contains: q.q.replace('@', ''), mode: 'insensitive' } },
              { accounts: { some: { accountNumber: { contains: q.q } } } },
            ],
          }
        : {}),
    };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy: { createdAt: q.sort === 'oldest' ? 'asc' : 'desc' }, skip: p.skip, take: p.take, include: { accounts: { where: { type: 'CUSTOMER_WALLET' }, select: { currency: true, balance: true, accountNumber: true } } } }),
      this.prisma.user.count({ where }),
    ]);
    return paged(
      users.map((u) => ({ ...publicUser(u), wallets: u.accounts.map((a) => ({ currency: a.currency, balance: a.balance.toFixed(2), accountNumber: a.accountNumber })) })),
      total,
      p,
    );
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound('User');
    const [accounts, cards, loans, goals, fds, kyc, tickets, notes, flags, referredBy, limits] = await Promise.all([
      this.prisma.ledgerAccount.findMany({ where: { ownerId: id }, orderBy: [{ type: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.virtualCard.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.loan.findMany({ where: { userId: id }, include: { product: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.savingsGoal.findMany({ where: { userId: id } }),
      this.prisma.fixedDeposit.findMany({ where: { userId: id } }),
      this.prisma.kycSubmission.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.supportTicket.findMany({ where: { userId: id }, orderBy: { lastActivityAt: 'desc' } }),
      this.prisma.adminNote.findMany({ where: { userId: id }, include: { admin: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.fraudFlag.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      user.referredById ? this.prisma.user.findUnique({ where: { id: user.referredById }, select: { id: true, firstName: true, lastName: true } }) : null,
      this.guard.limits(user),
    ]);
    return {
      user: { ...publicUser(user), failedLoginCount: user.failedLoginCount, lockedUntil: user.lockedUntil, limitOverrideDailyUsd: user.limitOverrideDailyUsd?.toFixed(2) ?? null, pinLockedUntil: user.pinLockedUntil },
      limits,
      referredBy,
      accounts: accounts.map((a) => ({ ...a, balance: a.balance.toFixed(2), availableBalance: a.availableBalance.toFixed(2) })),
      cards: cards.map(({ panEnc: _p, cvvEnc: _c, ...c }) => ({ ...c, spendLimit: c.spendLimit.toFixed(2), balance: accounts.find((a) => a.id === c.accountId)?.balance.toFixed(2) })),
      loans: loans.map((l) => ({ ...l, principal: l.principal.toFixed(2), totalRepayable: l.totalRepayable.toFixed(2), amountRepaid: l.amountRepaid.toFixed(2) })),
      goals: goals.map((g) => ({ ...g, targetAmount: g.targetAmount.toFixed(2), balance: accounts.find((a) => a.id === g.accountId)?.balance.toFixed(2) })),
      fixedDeposits: fds.map((f) => ({ ...f, principal: f.principal.toFixed(2) })),
      kyc,
      tickets,
      notes,
      flags,
    };
  }

  @Get(':id/transactions')
  transactions(@Param('id') id: string, @Query() q: TxFilter) {
    return this.accounts.transactions(id, q, { adminView: true });
  }

  @Get(':id/sessions')
  sessionsList(@Param('id') id: string, @Query('all') all?: string) {
    return this.prisma.session.findMany({
      where: { userId: id, ...(all === 'true' ? {} : { revokedAt: null, expiresAt: { gt: new Date() } }) },
      orderBy: { lastSeenAt: 'desc' },
      take: 50,
      select: { id: true, browser: true, os: true, deviceType: true, ip: true, location: true, createdAt: true, lastSeenAt: true, expiresAt: true, revokedAt: true, revokedReason: true },
    });
  }

  @Get(':id/logins')
  logins(@Param('id') id: string) {
    return this.prisma.loginEvent.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  @Get(':id/audit')
  auditTrail(@Param('id') id: string) {
    return this.prisma.auditLog.findMany({ where: { OR: [{ targetId: id }, { actorId: id }] }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  /** Read-only "impersonation": exactly the data the customer dashboard shows. */
  @Roles('SUPERADMIN')
  @Get(':id/customer-view')
  async customerView(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Req() req: Request) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound('User');
    await this.audit.log(this.admin.actor(admin, clientIp(req)), 'user.impersonate_view', { type: 'User', id });
    const [summary, recent, insights] = await Promise.all([this.accounts.summary(user), this.accounts.transactions(id, { pageSize: 10 }), this.insights.analytics(user, 6)]);
    return { user: publicUser(user), summary, recent: recent.items, insights };
  }

  @Roles('ADMIN', 'COMPLIANCE')
  @HttpCode(200)
  @Post(':id/status')
  async status(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { status, reason } = parse(z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'BLOCKED', 'CLOSED']), reason: z.string().trim().min(3).max(500) }), body);
    if (status === 'CLOSED' && admin.role !== 'SUPERADMIN' && admin.role !== 'ADMIN') throw new AppError('FORBIDDEN', 'Only admins can close accounts.');
    await this.admin.setUserStatus(admin, id, status, reason);
    return { ok: true };
  }

  @Roles('ADMIN', 'SUPPORT')
  @Patch(':id')
  async edit(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(updateProfileSchema.partial().extend({ email: z.string().email().optional(), reason: z.string().min(3) }), body);
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw notFound('User');
    const { reason, ...data } = input;
    if (data.email && data.email !== before.email && (await this.prisma.user.findUnique({ where: { email: data.email } }))) throw new AppError('CONFLICT', 'Email already in use');
    if (data.tag && data.tag !== before.tag && (await this.prisma.user.findUnique({ where: { tag: data.tag } }))) throw new AppError('CONFLICT', 'Tag already in use');
    const after = await this.prisma.user.update({ where: { id }, data });
    await this.audit.log(this.admin.actor(admin), 'user.edit', { type: 'User', id }, { reason, before: publicUser(before), after: publicUser(after) });
    return publicUser(after);
  }

  @Roles('ADMIN', 'COMPLIANCE')
  @HttpCode(200)
  @Post(':id/kyc-level')
  async kycLevel(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { level, reason } = parse(z.object({ level: z.number().int().min(0).max(3), reason: z.string().min(3) }), body);
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    await this.prisma.user.update({ where: { id }, data: { kycLevel: level } });
    await this.audit.log(this.admin.actor(admin), 'user.kyc_level', { type: 'User', id }, { reason, before: { kycLevel: before.kycLevel }, after: { kycLevel: level } });
    if (level >= 2) await this.admin.payReferralBonus(id);
    return { ok: true };
  }

  @Roles('ADMIN', 'COMPLIANCE')
  @HttpCode(200)
  @Post(':id/limits')
  async limits(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { dailyUsd, reason } = parse(z.object({ dailyUsd: z.number().min(0).nullable(), reason: z.string().min(3) }), body);
    await this.prisma.user.update({ where: { id }, data: { limitOverrideDailyUsd: dailyUsd } });
    await this.audit.log(this.admin.actor(admin), 'user.limit_override', { type: 'User', id }, { reason, after: { dailyUsd } });
    return { ok: true };
  }

  @Roles('ADMIN', 'SUPPORT', 'COMPLIANCE')
  @HttpCode(200)
  @Post(':id/force-logout')
  async forceLogout(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { sessionId, reason } = parse(z.object({ sessionId: z.string().optional(), reason: z.string().min(3) }), body);
    let count = 1;
    if (sessionId) {
      const s = await this.prisma.session.findFirst({ where: { id: sessionId, userId: id } });
      if (!s) throw notFound('Session');
      await this.sessions.revoke(sessionId, `Revoked by admin: ${reason}`);
    } else count = await this.sessions.revokeWhere({ userId: id }, `Signed out by admin: ${reason}`);
    await this.audit.log(this.admin.actor(admin), sessionId ? 'session.revoke' : 'session.revoke_all', { type: 'User', id }, { reason, after: { sessionId, count } });
    return { revoked: count };
  }

  @Roles('ADMIN', 'SUPPORT')
  @HttpCode(200)
  @Post(':id/reset-2fa')
  async reset2fa(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { reason } = parse(adminReasonSchema, body);
    await this.prisma.user.update({ where: { id }, data: { twoFactorEnabled: false, twoFactorSecret: null, backupCodes: [] } });
    await this.audit.log(this.admin.actor(admin), 'user.reset_2fa', { type: 'User', id }, { reason });
    await this.notifications.notify(id, { category: 'SECURITY', type: '2FA_RESET', title: 'Two-factor authentication reset', body: 'One Bank support reset your two-factor authentication. Please set it up again.', email: { template: 'two-factor', data: { enabled: false } } });
    return { ok: true };
  }

  @Roles('ADMIN', 'SUPPORT')
  @HttpCode(200)
  @Post(':id/reset-pin-lock')
  async resetPinLock(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { reason } = parse(adminReasonSchema, body);
    await this.prisma.user.update({ where: { id }, data: { pinFailedAttempts: 0, pinLockedUntil: null, failedLoginCount: 0, lockedUntil: null } });
    await this.audit.log(this.admin.actor(admin), 'user.unlock', { type: 'User', id }, { reason });
    return { ok: true };
  }

  @Roles('ADMIN', 'SUPPORT')
  @HttpCode(200)
  @Post(':id/resend-verification')
  async resendVerification(@CurrentAdmin() admin: AdminUser, @Param('id') id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (user.status !== 'PENDING_VERIFICATION') throw new AppError('CONFLICT', 'User is already verified');
    await this.auth.sendVerification(user);
    await this.audit.log(this.admin.actor(admin), 'user.resend_verification', { type: 'User', id });
    return { ok: true };
  }

  @Roles('ADMIN', 'SUPPORT')
  @HttpCode(200)
  @Post(':id/verify-email')
  async markVerified(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { reason } = parse(adminReasonSchema, body);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (user.status !== 'PENDING_VERIFICATION') throw new AppError('CONFLICT', 'User is already verified');
    const token = await this.auth.issueToken('EMAIL_VERIFY', { userId: id, ttlMinutes: 5 });
    await this.auth.verifyEmail(token);
    await this.audit.log(this.admin.actor(admin), 'user.manual_verify', { type: 'User', id }, { reason });
    return { ok: true };
  }

  @Roles('ADMIN', 'SUPPORT')
  @HttpCode(200)
  @Post(':id/notify')
  async notify(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(adminNotifySchema, body);
    const inApp = input.channels.includes('IN_APP');
    const email = input.channels.includes('EMAIL');
    if (inApp) {
      await this.notifications.notify(id, { category: 'ACCOUNT', type: 'ADMIN_MESSAGE', title: input.title, body: input.body, link: input.link, email: email ? { template: 'broadcast', data: input } : undefined });
    } else if (email) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
      await this.mail.send(user.email, 'broadcast', { ...input });
    }
    await this.audit.log(this.admin.actor(admin), 'user.notify', { type: 'User', id }, { after: input });
    return { ok: true };
  }

  @Post(':id/notes')
  async addNote(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { body: text } = parse(z.object({ body: z.string().trim().min(1).max(2000) }), body);
    return this.prisma.adminNote.create({ data: { userId: id, adminId: admin.id, body: text } });
  }
}

// =====================================================================
// Accounts, ledger & transactions
// =====================================================================

@UseGuards(AdminAuthGuard)
@Controller('admin')
export class AdminLedgerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminService,
    private readonly ledger: LedgerService,
    private readonly accounts: AccountsService,
    private readonly transfers: TransfersService,
    private readonly pdf: PdfService,
    private readonly audit: AuditService,
  ) {}

  @Roles('ADMIN', 'COMPLIANCE')
  @HttpCode(200)
  @Post('accounts/:id/status')
  async accountStatus(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { status, reason } = parse(z.object({ status: z.enum(['ACTIVE', 'FROZEN']), reason: z.string().min(3) }), body);
    await this.admin.setAccountStatus(admin, id, status, reason);
    return { ok: true };
  }

  @Roles('ADMIN')
  @Post('ledger/adjust')
  adjust(@CurrentAdmin() admin: AdminUser, @Body() body: unknown) {
    return this.admin.adjust(admin, parse(adminAdjustSchema, body));
  }

  @Roles('ADMIN')
  @Post('ledger/custom-transaction')
  custom(@CurrentAdmin() admin: AdminUser, @Body() body: unknown) {
    return this.admin.customTransaction(admin, parse(adminCustomTransactionSchema, body));
  }

  @Roles('ADMIN')
  @HttpCode(200)
  @Post('transactions/:id/reverse')
  reverse(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { reason, force } = parse(z.object({ reason: z.string().min(3), force: z.boolean().optional().default(false) }), body);
    return this.admin.reverse(admin, id, reason, force);
  }

  @Roles('ADMIN')
  @HttpCode(200)
  @Post('transactions/:id/pending')
  async pending(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { action, reason } = parse(z.object({ action: z.enum(['settle', 'fail']), reason: z.string().min(3) }), body);
    await this.admin.settlePending(admin, id, action, reason);
    return { ok: true };
  }

  @Get('transactions')
  async transactions(@Query() q: { q?: string; type?: string; status?: string; currency?: string; from?: string; to?: string; userId?: string; minAmount?: string; page?: string; pageSize?: string }) {
    const p = page(q);
    const where: Prisma.JournalEntryWhereInput = {
      ...(q.type ? { type: q.type as never } : {}),
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.from || q.to ? { valueDate: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(new Date(q.to).getTime() + 86_399_999) } : {}) } } : {}),
      ...(q.q
        ? {
            OR: [
              { reference: { contains: q.q, mode: 'insensitive' } },
              { description: { contains: q.q, mode: 'insensitive' } },
              { counterpartyName: { contains: q.q, mode: 'insensitive' } },
              { counterpartyAccount: { contains: q.q } },
            ],
          }
        : {}),
      ...(q.userId || q.currency
        ? {
            OR: [
              { postings: { some: { account: { ...(q.userId ? { ownerId: q.userId } : {}), ...(q.currency ? { currency: q.currency } : {}) } } } },
              { holds: { some: { accountId: { in: (await this.prisma.ledgerAccount.findMany({ where: { ...(q.userId ? { ownerId: q.userId } : {}), ...(q.currency ? { currency: q.currency } : {}) }, select: { id: true } })).map((a) => a.id) } } } },
            ],
          }
        : {}),
    };
    const [entries, total] = await Promise.all([
      this.prisma.journalEntry.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { postings: { include: { account: { include: { owner: { select: { id: true, firstName: true, lastName: true } } } } } }, holds: true, transfer: { select: { status: true, kind: true } } } }),
      this.prisma.journalEntry.count({ where }),
    ]);
    const holdAccts = await this.prisma.ledgerAccount.findMany({ where: { id: { in: entries.flatMap((e) => e.holds.map((h) => h.accountId)) } }, include: { owner: { select: { id: true, firstName: true, lastName: true } } } });
    return paged(
      entries.map((e) => {
        const cust = e.postings.find((x) => x.account.ownerId);
        const hold = e.holds[0];
        const holdAcct = hold ? holdAccts.find((a) => a.id === hold.accountId) : undefined;
        const owner = cust?.account.owner ?? holdAcct?.owner ?? null;
        return {
          id: e.id,
          reference: e.reference,
          type: e.type,
          status: e.status,
          transferStatus: e.transfer?.status,
          description: e.description,
          counterparty: e.counterpartyName,
          initiatorType: e.initiatorType,
          amount: cust ? cust.amount.toFixed(2) : hold ? `-${hold.amount.toFixed(2)}` : e.postings[0]?.amount.toFixed(2),
          currency: cust?.currency ?? holdAcct?.currency ?? e.postings[0]?.currency,
          user: owner ? { id: owner.id, name: `${owner.firstName} ${owner.lastName}` } : null,
          valueDate: e.valueDate,
          createdAt: e.createdAt,
        };
      }),
      total,
      p,
    );
  }

  @Get('transactions/:id')
  async transaction(@Param('id') id: string) {
    const tx = await this.accounts.transaction(null, id);
    const flags = await this.prisma.fraudFlag.findMany({ where: { entryId: id } });
    const audit = await this.prisma.auditLog.findMany({ where: { targetId: { in: [id, tx.transfer?.id ?? '-'] } }, orderBy: { createdAt: 'desc' } });
    return { ...tx, flags, audit };
  }

  @Get('transactions/:id/receipt')
  async receipt(@Param('id') id: string, @Res() res: Response) {
    const pdf = await this.pdf.receipt(null, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);
  }

  // ----- review queue & fraud -----

  @Get('review-queue')
  async reviewQueue() {
    const transfers = await this.prisma.transfer.findMany({ where: { status: 'AWAITING_REVIEW' }, orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, firstName: true, lastName: true, email: true, kycLevel: true } }, entry: { include: { fraudFlags: true } } } });
    return transfers.map((t) => ({ ...t, amount: t.amount.toFixed(2), fee: t.fee.toFixed(2) }));
  }

  @Roles('ADMIN', 'COMPLIANCE')
  @HttpCode(200)
  @Post('transfers/:id/approve')
  async approve(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { note } = parse(z.object({ note: z.string().max(500).optional() }), body);
    await this.transfers.approveReview(id, admin.id, note);
    await this.transfers.adminAudit(admin.id, 'transfer.approve', id, note);
    return { ok: true };
  }

  @Roles('ADMIN', 'COMPLIANCE')
  @HttpCode(200)
  @Post('transfers/:id/reject')
  async reject(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { reason } = parse(adminReasonSchema, body);
    await this.transfers.failTransfer(id, reason, 'REJECTED', admin.id);
    await this.transfers.adminAudit(admin.id, 'transfer.reject', id, reason);
    return { ok: true };
  }

  @Roles('ADMIN')
  @HttpCode(200)
  @Post('transfers/:id/settle-now')
  async settleNow(@CurrentAdmin() admin: AdminUser, @Param('id') id: string) {
    const t = await this.prisma.transfer.findUniqueOrThrow({ where: { id } });
    if (t.status === 'PENDING' && t.kind === 'WIRE') await this.transfers.advance(id);
    await this.transfers.advance(id);
    await this.transfers.adminAudit(admin.id, 'transfer.settle_now', id);
    return { ok: true };
  }

  @Get('fraud-flags')
  fraudFlags(@Query('status') status = 'OPEN') {
    return this.prisma.fraudFlag.findMany({ where: status === 'ALL' ? {} : { status }, orderBy: { createdAt: 'desc' }, take: 200, include: { user: { select: { id: true, firstName: true, lastName: true, email: true } }, entry: { select: { id: true, reference: true, description: true } } } });
  }

  @Roles('ADMIN', 'COMPLIANCE')
  @HttpCode(200)
  @Post('fraud-flags/:id')
  async resolveFlag(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { status, note } = parse(z.object({ status: z.enum(['DISMISSED', 'CONFIRMED']), note: z.string().max(500).optional() }), body);
    await this.prisma.fraudFlag.update({ where: { id }, data: { status, resolvedById: admin.id, resolvedAt: new Date() } });
    await this.audit.log(this.admin.actor(admin), `fraud.${status.toLowerCase()}`, { type: 'FraudFlag', id }, { reason: note });
    return { ok: true };
  }

  // ----- treasury -----

  @Get('ledger/system-accounts')
  async systemAccounts() {
    const rows = await this.prisma.ledgerAccount.findMany({ where: { type: 'SYSTEM' }, orderBy: [{ systemCode: 'asc' }, { currency: 'asc' }] });
    return { codes: SYSTEM_CODES, accounts: rows.map((r) => ({ ...r, balance: r.balance.toFixed(2), availableBalance: r.availableBalance.toFixed(2) })) };
  }

  @Roles('ADMIN')
  @Get('ledger/reconcile')
  async reconcile(@CurrentAdmin() admin: AdminUser) {
    const r = await this.ledger.reconcile();
    await this.audit.log(this.admin.actor(admin), 'ledger.reconcile', undefined, { after: { ok: r.ok, mismatches: r.mismatches.length } });
    return r;
  }
}

// =====================================================================
// KYC, support, cards, loans
// =====================================================================

@UseGuards(AdminAuthGuard)
@Controller('admin')
export class AdminOpsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminService,
    private readonly support: SupportService,
    private readonly loans: LoansService,
    private readonly products: ProductsService,
    private readonly audit: AuditService,
  ) {}

  // ----- KYC -----
  @Get('kyc')
  kyc(@Query('status') status = 'PENDING') {
    return this.prisma.kycSubmission.findMany({
      where: status === 'ALL' ? {} : { status: status as never },
      orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
      take: 200,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, dateOfBirth: true, country: true, addressLine1: true, city: true, kycLevel: true, createdAt: true } } },
    });
  }

  @Roles('ADMIN', 'COMPLIANCE')
  @HttpCode(200)
  @Post('kyc/:id/review')
  async review(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { approve, note } = parse(z.object({ approve: z.boolean(), note: z.string().trim().min(2).max(500) }), body);
    await this.admin.reviewKyc(admin, id, approve, note);
    return { ok: true };
  }

  @Roles('ADMIN', 'COMPLIANCE')
  @Get('kyc/files/:file')
  kycFile(@Param('file') file: string, @Res() res: Response) {
    sendUpload(res, 'kyc', file);
  }

  // ----- support -----
  @Get('tickets')
  async tickets(@Query() q: { status?: string; priority?: string; assigned?: string; q?: string; page?: string }) {
    const p = page(q);
    const where: Prisma.SupportTicketWhereInput = {
      ...(q.status ? { status: q.status } : { status: { in: ['OPEN', 'PENDING'] } }),
      ...(q.status === 'ALL' ? { status: undefined } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.assigned === 'unassigned' ? { assignedAdminId: null } : q.assigned ? { assignedAdminId: q.assigned } : {}),
      ...(q.q ? { OR: [{ subject: { contains: q.q, mode: 'insensitive' } }, { user: { email: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.supportTicket.findMany({ where, orderBy: [{ lastActivityAt: 'desc' }], skip: p.skip, take: p.take, include: { user: { select: { id: true, firstName: true, lastName: true, email: true } }, assignedAdmin: { select: { id: true, firstName: true, lastName: true } } } }),
      this.prisma.supportTicket.count({ where }),
    ]);
    const stats = await this.prisma.$queryRaw<{ avg_first: number | null; avg_resolve: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM ("firstResponseAt" - "createdAt")))/3600 AS avg_first,
             AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))/3600 AS avg_resolve
      FROM "SupportTicket" WHERE "createdAt" >= now() - interval '30 days'`;
    return { ...paged(items, total, p), sla: { avgFirstResponseHours: stats[0]?.avg_first ? Number(stats[0].avg_first).toFixed(1) : null, avgResolutionHours: stats[0]?.avg_resolve ? Number(stats[0].avg_resolve).toFixed(1) : null } };
  }

  @Get('tickets/:id')
  async ticket(@Param('id') id: string) {
    const t = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } }, user: { select: { id: true, firstName: true, lastName: true, email: true, status: true, kycLevel: true } }, assignedAdmin: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!t) throw notFound('Ticket');
    return t;
  }

  @Roles('ADMIN', 'SUPPORT')
  @Post('tickets/:id/messages')
  @UseInterceptors(FilesInterceptor('files', 3, uploadOptions('tickets')))
  async reply(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: Record<string, unknown>, @UploadedFiles() files: Upload[] = []) {
    const input = parse(ticketReplySchema.extend({ internal: z.preprocess((v) => v === 'true' || v === true, z.boolean()), status: z.enum(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']).optional() }), body);
    await this.support.adminReply(admin.id, `${admin.firstName} (One Bank)`, id, input.message, input.internal, files, input.status);
    return this.ticket(id);
  }

  @Roles('ADMIN', 'SUPPORT')
  @Patch('tickets/:id')
  async updateTicket(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(z.object({ status: z.enum(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']).optional(), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(), assignedAdminId: z.string().nullable().optional() }), body);
    const before = await this.prisma.supportTicket.findUniqueOrThrow({ where: { id } });
    await this.prisma.supportTicket.update({ where: { id }, data: { ...input, ...(input.status === 'RESOLVED' || input.status === 'CLOSED' ? { resolvedAt: new Date() } : {}), lastActivityAt: new Date() } });
    if (input.status && input.status !== before.status && input.status === 'RESOLVED') {
      await this.support.adminReply(admin.id, 'One Bank', id, 'We have marked this request as resolved. Reply here if you need anything else.', false, [], 'RESOLVED');
    }
    await this.audit.log(this.admin.actor(admin), 'ticket.update', { type: 'SupportTicket', id }, { before: { status: before.status, priority: before.priority, assignedAdminId: before.assignedAdminId }, after: input });
    return this.ticket(id);
  }

  @Get('tickets/attachments/:file')
  attachment(@Param('file') file: string, @Res() res: Response) {
    sendUpload(res, 'tickets', file);
  }

  @Get('canned-replies')
  canned() {
    return this.prisma.cannedReply.findMany({ orderBy: { title: 'asc' } });
  }

  @Roles('ADMIN', 'SUPPORT')
  @Post('canned-replies')
  addCanned(@Body() body: unknown) {
    return this.prisma.cannedReply.create({ data: parse(z.object({ title: z.string().min(2), body: z.string().min(2) }), body) });
  }

  @Roles('ADMIN', 'SUPPORT')
  @Delete('canned-replies/:id')
  async deleteCanned(@Param('id') id: string) {
    await this.prisma.cannedReply.delete({ where: { id } });
    return { ok: true };
  }

  // ----- cards -----
  @Get('cards')
  async cards(@Query() q: { status?: string; q?: string; page?: string }) {
    const p = page(q);
    const where: Prisma.VirtualCardWhereInput = {
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.q ? { OR: [{ last4: { contains: q.q } }, { nameOnCard: { contains: q.q, mode: 'insensitive' } }, { user: { email: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
    const [cards, total] = await Promise.all([
      this.prisma.virtualCard.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } }),
      this.prisma.virtualCard.count({ where }),
    ]);
    const accts = await this.prisma.ledgerAccount.findMany({ where: { id: { in: cards.map((c) => c.accountId) } } });
    return paged(
      cards.map(({ panEnc: _p, cvvEnc: _c, ...c }) => ({ ...c, spendLimit: c.spendLimit.toFixed(2), balance: accts.find((a) => a.id === c.accountId)?.balance.toFixed(2) })),
      total,
      p,
    );
  }

  @Get('cards/:id/transactions')
  cardTx(@Param('id') id: string) {
    return this.prisma.cardTransaction.findMany({ where: { cardId: id }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  @Roles('ADMIN', 'COMPLIANCE')
  @HttpCode(200)
  @Post('cards/:id/status')
  async cardStatus(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { action, reason } = parse(z.object({ action: z.enum(['freeze', 'unfreeze', 'terminate']), reason: z.string().min(3) }), body);
    await this.admin.setCardStatus(admin, id, action, reason);
    return { ok: true };
  }

  @Roles('ADMIN')
  @HttpCode(200)
  @Post('cards/:id/simulate-purchase')
  async simulate(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const r = await this.products.simulatePurchase('', id, parse(simulatePurchaseSchema, body), { admin: true });
    await this.audit.log(this.admin.actor(admin), 'card.simulate_purchase', { type: 'VirtualCard', id }, { after: r });
    return r;
  }

  // ----- loans -----
  @Get('loans')
  async loansList(@Query('status') status?: string) {
    const loans = await this.prisma.loan.findMany({
      where: status ? { status: status as never } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { product: true, user: { select: { id: true, firstName: true, lastName: true, email: true, kycLevel: true } }, repayments: { orderBy: { dueDate: 'asc' } } },
    });
    return loans.map((l) => {
      const overdue = l.repayments.filter((r) => r.status === 'LATE' || (r.status === 'DUE' && r.dueDate < new Date())).length;
      return { ...this.loans.dto(l), overdueInstalments: overdue };
    });
  }

  @Roles('ADMIN')
  @HttpCode(200)
  @Post('loans/:id/approve')
  async approveLoan(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { note } = parse(z.object({ note: z.string().max(500).optional() }), body);
    await this.loans.approve(id, admin.id, note);
    return { ok: true };
  }

  @Roles('ADMIN')
  @HttpCode(200)
  @Post('loans/:id/reject')
  async rejectLoan(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { reason } = parse(adminReasonSchema, body);
    await this.loans.reject(id, admin.id, reason);
    return { ok: true };
  }

  @Roles('ADMIN')
  @HttpCode(200)
  @Post('loans/:id/default')
  async defaultLoan(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const { reason } = parse(adminReasonSchema, body);
    await this.loans.markDefaulted(id, admin.id, reason);
    return { ok: true };
  }
}

// =====================================================================
// Catalog, platform settings, comms, team, audit, sessions
// =====================================================================

@UseGuards(AdminAuthGuard)
@Controller('admin')
export class AdminPlatformController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminService,
    private readonly settings: SettingsService,
    private readonly sessions: SessionService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  // ----- settings -----
  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Roles('SUPERADMIN')
  @Put('settings')
  async putSettings(@CurrentAdmin() admin: AdminUser, @Body() body: unknown, @Req() req: Request) {
    const patch = parse(adminSettingsSchema, body);
    const { before, after } = await this.settings.update(patch as never, admin.id);
    const action = patch.maintenanceMode !== undefined && patch.maintenanceMode !== before.maintenanceMode ? (patch.maintenanceMode ? 'settings.maintenance_on' : 'settings.maintenance_off') : 'settings.update';
    await this.audit.log(this.admin.actor(admin, clientIp(req)), action, { type: 'SystemSetting', id: 'platform' }, { before, after });
    return after;
  }

  // ----- catalog: banks, bill providers, FX, loan products, FAQs -----
  @Get('banks')
  banks() {
    return this.prisma.bank.findMany({ orderBy: { name: 'asc' } });
  }

  @Roles('ADMIN')
  @Post('banks')
  async upsertBank(@CurrentAdmin() admin: AdminUser, @Body() body: unknown) {
    const b = parse(z.object({ code: z.string().min(2).max(12), name: z.string().min(2), country: z.string().length(2), active: z.boolean().default(true) }), body);
    const row = await this.prisma.bank.upsert({ where: { code: b.code }, create: b, update: b });
    await this.audit.log(this.admin.actor(admin), 'catalog.bank', { type: 'Bank', id: row.id }, { after: b });
    return row;
  }

  @Get('bill-providers')
  billProviders() {
    return this.prisma.billProvider.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  }

  @Roles('ADMIN')
  @Post('bill-providers')
  async upsertProvider(@CurrentAdmin() admin: AdminUser, @Body() body: unknown) {
    const b = parse(z.object({ code: z.string().min(2), name: z.string().min(2), category: z.string(), currencies: z.array(z.string()).min(1), active: z.boolean().default(true), logoColor: z.string().default('#C9A227') }), body);
    const row = await this.prisma.billProvider.upsert({ where: { code: b.code }, create: b, update: b });
    await this.audit.log(this.admin.actor(admin), 'catalog.bill_provider', { type: 'BillProvider', id: row.id }, { after: b });
    return row;
  }

  @Get('fx-rates')
  fxRates() {
    return this.prisma.fxRate.findMany({ orderBy: { quote: 'asc' } });
  }

  @Roles('ADMIN')
  @Put('fx-rates')
  async setRates(@CurrentAdmin() admin: AdminUser, @Body() body: unknown) {
    const rows = parse(z.array(z.object({ quote: z.string().length(3), rate: z.number().positive(), spread: z.number().min(0).max(10) })), body);
    const before = await this.prisma.fxRate.findMany();
    for (const r of rows) {
      await this.prisma.fxRate.upsert({ where: { base_quote: { base: 'USD', quote: r.quote } }, create: { base: 'USD', ...r }, update: { rate: r.rate, spread: r.spread } });
    }
    await this.audit.log(this.admin.actor(admin), 'catalog.fx_rates', { type: 'FxRate', id: 'USD' }, { before, after: rows });
    return this.fxRates();
  }

  @Get('loan-products')
  loanProducts() {
    return this.prisma.loanProduct.findMany({ orderBy: { name: 'asc' } });
  }

  @Roles('ADMIN')
  @Post('loan-products')
  async upsertLoanProduct(@CurrentAdmin() admin: AdminUser, @Body() body: unknown) {
    const b = parse(
      z.object({
        id: z.string().optional(),
        name: z.string().min(2),
        description: z.string().min(2),
        currency: z.string().length(3),
        minAmount: z.number().positive(),
        maxAmount: z.number().positive(),
        interestRate: z.number().min(0),
        minTenorMonths: z.number().int().min(1),
        maxTenorMonths: z.number().int().min(1),
        lateFeePercent: z.number().min(0).default(2),
        minKycLevel: z.number().int().min(0).max(3).default(2),
        active: z.boolean().default(true),
      }),
      body,
    );
    const { id, ...data } = b;
    const row = id ? await this.prisma.loanProduct.update({ where: { id }, data }) : await this.prisma.loanProduct.create({ data });
    await this.audit.log(this.admin.actor(admin), 'catalog.loan_product', { type: 'LoanProduct', id: row.id }, { after: data });
    return row;
  }

  @Get('faqs')
  faqs() {
    return this.prisma.faq.findMany({ orderBy: [{ category: 'asc' }, { order: 'asc' }] });
  }

  @Roles('ADMIN', 'SUPPORT')
  @Post('faqs')
  upsertFaq(@Body() body: unknown) {
    const b = parse(z.object({ id: z.string().optional(), category: z.string().min(2), question: z.string().min(5), answer: z.string().min(5), order: z.number().int().default(0), published: z.boolean().default(true) }), body);
    const { id, ...data } = b;
    return id ? this.prisma.faq.update({ where: { id }, data }) : this.prisma.faq.create({ data });
  }

  @Roles('ADMIN', 'SUPPORT')
  @Delete('faqs/:id')
  async deleteFaq(@Param('id') id: string) {
    await this.prisma.faq.delete({ where: { id } });
    return { ok: true };
  }

  @Get('contact-messages')
  contactMessages() {
    return this.prisma.contactMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  @HttpCode(200)
  @Post('contact-messages/:id/handled')
  async handled(@Param('id') id: string) {
    await this.prisma.contactMessage.update({ where: { id }, data: { handled: true } });
    return { ok: true };
  }

  @Get('subscribers')
  subscribers() {
    return this.prisma.newsletterSubscriber.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 });
  }

  // ----- announcements & broadcast -----
  @Get('announcements')
  announcements() {
    return this.prisma.announcement.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Roles('ADMIN', 'SUPPORT')
  @Post('announcements')
  async createAnnouncement(@CurrentAdmin() admin: AdminUser, @Body() body: unknown) {
    const a = parse(announcementSchema, body);
    const row = await this.prisma.announcement.create({ data: { ...a, startsAt: a.startsAt ?? new Date(), createdById: admin.id } });
    await this.audit.log(this.admin.actor(admin), 'announcement.create', { type: 'Announcement', id: row.id }, { after: a });
    return row;
  }

  @Roles('ADMIN', 'SUPPORT')
  @Patch('announcements/:id')
  updateAnnouncement(@Param('id') id: string, @Body() body: unknown) {
    return this.prisma.announcement.update({ where: { id }, data: parse(announcementSchema.partial(), body) });
  }

  @Roles('ADMIN', 'SUPPORT')
  @Delete('announcements/:id')
  async deleteAnnouncement(@Param('id') id: string) {
    await this.prisma.announcement.delete({ where: { id } });
    return { ok: true };
  }

  @Roles('ADMIN', 'SUPPORT')
  @HttpCode(200)
  @Post('broadcast')
  async broadcast(@CurrentAdmin() admin: AdminUser, @Body() body: unknown) {
    const input = parse(adminBroadcastSchema, body);
    const where: Prisma.UserWhereInput = {
      status: input.segment.status ? (input.segment.status as never) : { in: ['ACTIVE', 'SUSPENDED'] },
      ...(input.segment.kycLevel !== undefined ? { kycLevel: input.segment.kycLevel } : {}),
      ...(input.segment.country ? { country: input.segment.country } : {}),
      ...(input.segment.currency ? { accounts: { some: { currency: input.segment.currency, type: 'CUSTOMER_WALLET' } } } : {}),
    };
    const users = await this.prisma.user.findMany({ where, select: { id: true, email: true } });
    const inApp = input.channels.includes('IN_APP');
    const email = input.channels.includes('EMAIL');
    for (const u of users) {
      if (inApp) {
        await this.notifications.notify(u.id, { category: 'MARKETING', type: 'BROADCAST', title: input.title, body: input.body, link: input.link, email: email ? { template: 'broadcast', data: input } : undefined });
      } else if (email) {
        await this.mail.send(u.email, 'broadcast', { ...input });
      }
    }
    await this.audit.log(this.admin.actor(admin), 'notification.broadcast', undefined, { after: { ...input, recipients: users.length } });
    return { recipients: users.length };
  }

  @Get('emails')
  async emails(@Query() q: { status?: string; q?: string; page?: string }) {
    const p = page(q);
    const where: Prisma.EmailLogWhereInput = { ...(q.status ? { status: q.status } : {}), ...(q.q ? { OR: [{ to: { contains: q.q, mode: 'insensitive' } }, { subject: { contains: q.q, mode: 'insensitive' } }] } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.emailLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, select: { id: true, to: true, subject: true, template: true, status: true, error: true, attempts: true, sentAt: true, createdAt: true } }),
      this.prisma.emailLog.count({ where }),
    ]);
    return paged(items, total, p);
  }

  @Get('emails/:id')
  email(@Param('id') id: string) {
    return this.prisma.emailLog.findUniqueOrThrow({ where: { id } });
  }

  @Roles('ADMIN', 'SUPPORT')
  @HttpCode(200)
  @Post('emails/:id/resend')
  async resendEmail(@Param('id') id: string) {
    await this.mail.resend(id);
    return { ok: true };
  }

  // ----- sessions -----
  @Get('sessions')
  async allSessions(@Query() q: { realm?: string; q?: string; page?: string }) {
    const p = page(q);
    const where: Prisma.SessionWhereInput = {
      revokedAt: null,
      expiresAt: { gt: new Date() },
      ...(q.realm === 'admin' ? { adminId: { not: null } } : q.realm === 'user' ? { userId: { not: null } } : {}),
      ...(q.q ? { OR: [{ ip: { contains: q.q } }, { user: { email: { contains: q.q, mode: 'insensitive' } } }, { admin: { email: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.session.findMany({
        where,
        orderBy: { lastSeenAt: 'desc' },
        skip: p.skip,
        take: p.take,
        select: { id: true, browser: true, os: true, deviceType: true, ip: true, location: true, createdAt: true, lastSeenAt: true, expiresAt: true, user: { select: { id: true, email: true, firstName: true, lastName: true } }, admin: { select: { id: true, email: true, firstName: true, lastName: true, role: true } } },
      }),
      this.prisma.session.count({ where }),
    ]);
    const online = await this.prisma.session.count({ where: { ...where, lastSeenAt: { gte: new Date(Date.now() - 5 * 60_000) } } });
    return { ...paged(items, total, p), onlineNow: online };
  }

  @Roles('ADMIN', 'SUPPORT', 'COMPLIANCE')
  @Delete('sessions/:id')
  async revokeSession(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @SessionId() sid: string) {
    if (id === sid) throw new AppError('VALIDATION', 'Use sign out for your own session.');
    const s = await this.prisma.session.findUniqueOrThrow({ where: { id } });
    if (s.adminId && admin.role !== 'SUPERADMIN') throw new AppError('FORBIDDEN', 'Only superadmins can revoke admin sessions.');
    await this.sessions.revoke(id, `Revoked by admin ${admin.email}`);
    await this.audit.log(this.admin.actor(admin), 'session.revoke', { type: 'Session', id });
    return { ok: true };
  }

  // ----- admin team -----
  @Get('team')
  async team() {
    const admins = await this.prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } });
    return admins.map(publicAdmin);
  }

  @Roles('SUPERADMIN')
  @Post('team')
  async invite(@CurrentAdmin() admin: AdminUser, @Body() body: unknown) {
    const input = parse(adminInviteSchema, body);
    if (await this.prisma.adminUser.findUnique({ where: { email: input.email } })) throw new AppError('CONFLICT', 'An admin with that email already exists.');
    const invited = await this.prisma.adminUser.create({ data: { ...input, status: 'INVITED' } });
    const token = await this.auth.issueToken('ADMIN_INVITE', { adminId: invited.id, ttlMinutes: 72 * 60 });
    await this.mail.send(input.email, 'admin-invite', { firstName: input.firstName, role: input.role, url: `${config.adminUrl}/accept-invite?token=${token}` });
    await this.audit.log(this.admin.actor(admin), 'team.invite', { type: 'AdminUser', id: invited.id }, { after: input });
    return publicAdmin(invited);
  }

  @Roles('SUPERADMIN')
  @Patch('team/:id')
  async updateAdmin(@CurrentAdmin() admin: AdminUser, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(z.object({ role: z.enum(['SUPERADMIN', 'ADMIN', 'SUPPORT', 'COMPLIANCE']).optional(), status: z.enum(['ACTIVE', 'DISABLED']).optional(), reset2fa: z.boolean().optional() }), body);
    if (id === admin.id && (input.status === 'DISABLED' || (input.role && input.role !== 'SUPERADMIN'))) throw new AppError('VALIDATION', 'You cannot demote or disable yourself.');
    const before = await this.prisma.adminUser.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.adminUser.update({
      where: { id },
      data: { ...(input.role ? { role: input.role } : {}), ...(input.status ? { status: input.status } : {}), ...(input.reset2fa ? { twoFactorEnabled: false, twoFactorSecret: null } : {}) },
    });
    if (input.status === 'DISABLED' || input.reset2fa || input.role) await this.sessions.revokeWhere({ adminId: id }, 'Admin account changed');
    await this.audit.log(this.admin.actor(admin), 'team.update', { type: 'AdminUser', id }, { before: publicAdmin(before), after: publicAdmin(after) });
    return publicAdmin(after);
  }

  // ----- audit -----
  @Roles('ADMIN', 'COMPLIANCE')
  @Get('audit')
  async auditLog(@Query() q: { actorId?: string; action?: string; targetType?: string; q?: string; from?: string; to?: string; page?: string; format?: string }, @Res({ passthrough: true }) res: Response) {
    const p = page({ ...q, pageSize: q.format === 'csv' ? '100' : undefined });
    const where: Prisma.AuditLogWhereInput = {
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.action ? { action: { contains: q.action } } : {}),
      ...(q.targetType ? { targetType: q.targetType } : {}),
      ...(q.q ? { OR: [{ actorEmail: { contains: q.q, mode: 'insensitive' } }, { targetId: q.q }, { reason: { contains: q.q, mode: 'insensitive' } }] } : {}),
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(new Date(q.to).getTime() + 86_399_999) } : {}) } } : {}),
    };
    if (q.format === 'csv') {
      const rows = await this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 5000 });
      const esc = (v: unknown) => {
        // Neutralise spreadsheet formulas (=, +, @, tab/CR, or '-' not followed by a number).
        let s = String(v ?? '');
        if (/^[=+@\t\r]/.test(s) || /^-(?!\d)/.test(s)) s = `'${s}`;
        return `"${s.replace(/"/g, '""')}"`;
      };
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="onebank-audit.csv"');
      return ['Time,Actor,Action,Target type,Target id,Reason,IP', ...rows.map((r) => [r.createdAt.toISOString(), r.actorEmail ?? r.actorId, r.action, r.targetType, r.targetId, r.reason, r.ip].map(esc).join(','))].join('\n');
    }
    const [items, total] = await Promise.all([this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }), this.prisma.auditLog.count({ where })]);
    return paged(items, total, p);
  }
}
