import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Sse, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@prisma/client';
import {
  NOTIFICATION_CATEGORIES,
  changeEmailSchema,
  changePasswordSchema,
  pinSchema,
  resetPinSchema,
  setPinSchema,
  updateProfileSchema,
} from '@onebank/shared';
import argon2 from 'argon2';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { Observable, interval, map, merge } from 'rxjs';
import { z } from 'zod';
import { config } from '../../config';
import { AppError, notFound } from '../../common/app-error';
import { decrypt, encrypt, randomCode, randomDigits, sha256 } from '../../common/crypto';
import { parse } from '../../common/http';
import { PrismaService, RedisService } from '../../common/infra';
import { AuthService } from '../auth/auth.service';
import { CurrentUser, SessionId, UserAuthGuard } from '../auth/guards';
import { SessionService } from '../auth/session.service';
import { AuditService } from '../core/audit.service';
import { MailService } from '../core/mail.service';
import { MoneyGuardService } from '../core/money-guard.service';
import { NotificationsService } from '../core/notifications.service';

export function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    firstName: u.firstName,
    lastName: u.lastName,
    dateOfBirth: u.dateOfBirth,
    country: u.country,
    addressLine1: u.addressLine1,
    city: u.city,
    state: u.state,
    postalCode: u.postalCode,
    status: u.status,
    statusReason: u.statusReason,
    kycLevel: u.kycLevel,
    baseCurrency: u.baseCurrency,
    tag: u.tag,
    referralCode: u.referralCode,
    hasPin: !!u.transactionPinHash,
    twoFactorEnabled: u.twoFactorEnabled,
    emailVerified: !!u.emailVerifiedAt,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  };
}

@UseGuards(UserAuthGuard)
@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly sessions: SessionService,
    private readonly auth: AuthService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly guard: MoneyGuardService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  me(@CurrentUser() user: User) {
    return publicUser(user);
  }

  @Patch()
  async update(@CurrentUser() user: User, @Body() body: unknown) {
    const input = parse(updateProfileSchema, body);
    if (input.tag && input.tag !== user.tag) {
      const taken = await this.prisma.user.findUnique({ where: { tag: input.tag } });
      if (taken) throw new AppError('CONFLICT', 'That @tag is already taken.');
    }
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: input });
    return publicUser(updated);
  }

  // ---------- security ----------

  @Get('sessions')
  async sessionsList(@CurrentUser() user: User, @SessionId() sid: string) {
    const rows = await this.prisma.session.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map(({ refreshTokenHash: _h, familyId: _f, ...s }) => ({ ...s, current: s.id === sid }));
  }

  @Delete('sessions/:id')
  async revokeSession(@CurrentUser() user: User, @Param('id') id: string, @SessionId() sid: string) {
    const s = await this.prisma.session.findFirst({ where: { id, userId: user.id } });
    if (!s) throw notFound('Session');
    if (s.id === sid) throw new AppError('VALIDATION', 'Use “Sign out” to end your current session.');
    await this.sessions.revoke(id, 'Revoked by user');
    return { ok: true };
  }

  @HttpCode(200)
  @Post('sessions/revoke-others')
  async revokeOthers(@CurrentUser() user: User, @SessionId() sid: string) {
    const count = await this.sessions.revokeWhere({ userId: user.id, NOT: { id: sid } }, 'Signed out of all other devices');
    return { revoked: count };
  }

  @Get('login-history')
  loginHistory(@CurrentUser() user: User) {
    return this.prisma.loginEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('password')
  async changePassword(@CurrentUser() user: User, @SessionId() sid: string, @Body() body: unknown) {
    const input = parse(changePasswordSchema, body);
    if (!(await argon2.verify(user.passwordHash, input.currentPassword))) throw new AppError('INVALID_CREDENTIALS', 'Your current password is incorrect.');
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await argon2.hash(input.newPassword) } });
    await this.sessions.revokeWhere({ userId: user.id, NOT: { id: sid } }, 'Password changed');
    await this.notifications.notify(user.id, {
      category: 'SECURITY',
      type: 'PASSWORD_CHANGED',
      title: 'Password changed',
      body: 'Your password was changed and other devices were signed out.',
      email: { template: 'password-changed', data: {} },
    });
    return { ok: true };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('email')
  async changeEmail(@CurrentUser() user: User, @Body() body: unknown) {
    const input = parse(changeEmailSchema, body);
    if (!(await argon2.verify(user.passwordHash, input.password))) throw new AppError('INVALID_CREDENTIALS', 'Your password is incorrect.');
    if (await this.prisma.user.findUnique({ where: { email: input.newEmail } })) throw new AppError('CONFLICT', 'That email is already in use.');
    const token = await this.auth.issueToken('EMAIL_CHANGE', { userId: user.id, ttlMinutes: 60, payload: { newEmail: input.newEmail } });
    await this.mail.send(input.newEmail, 'email-change-confirm', { url: `${config.webUrl}/confirm-email?token=${token}` });
    await this.mail.send(user.email, 'email-change-alert', { newEmail: input.newEmail });
    return { message: `We sent a confirmation link to ${input.newEmail}.` };
  }

  @HttpCode(200)
  @Post('2fa/setup')
  async twoFactorSetup(@CurrentUser() user: User) {
    if (user.twoFactorEnabled) throw new AppError('CONFLICT', 'Two-factor authentication is already enabled.');
    const secret = authenticator.generateSecret();
    await this.redis.client.set(`2fa:setup:${user.id}`, encrypt(secret), 'EX', 600);
    const otpauth = authenticator.keyuri(user.email, 'One Bank', secret);
    return { secret, otpauth, qr: await QRCode.toDataURL(otpauth, { margin: 1, width: 220 }) };
  }

  @HttpCode(200)
  @Post('2fa/enable')
  async twoFactorEnable(@CurrentUser() user: User, @Body() body: unknown) {
    const { code } = parse(z.object({ code: z.string().regex(/^\d{6}$/) }), body);
    const enc = await this.redis.client.get(`2fa:setup:${user.id}`);
    if (!enc) throw new AppError('INVALID_TOKEN', 'Setup expired. Please start again.');
    if (!authenticator.check(code, decrypt(enc))) throw new AppError('INVALID_2FA', 'That code is not correct. Check your authenticator app and try again.');
    const backupCodes = Array.from({ length: 10 }, () => `${randomCode(5)}-${randomCode(5)}`);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true, twoFactorSecret: enc, backupCodes: backupCodes.map((c) => sha256(c.replace('-', ''))) },
    });
    await this.redis.client.del(`2fa:setup:${user.id}`);
    await this.notifications.notify(user.id, {
      category: 'SECURITY',
      type: '2FA_ENABLED',
      title: 'Two-factor authentication enabled',
      body: 'Your account is now protected with an authenticator app.',
      email: { template: 'two-factor', data: { enabled: true } },
    });
    return { backupCodes };
  }

  @HttpCode(200)
  @Post('2fa/disable')
  async twoFactorDisable(@CurrentUser() user: User, @Body() body: unknown) {
    const { password, code } = parse(z.object({ password: z.string(), code: z.string() }), body);
    if (!(await argon2.verify(user.passwordHash, password))) throw new AppError('INVALID_CREDENTIALS', 'Your password is incorrect.');
    if (!(await this.auth.checkTwoFactor(user, code))) throw new AppError('INVALID_2FA', 'Invalid authentication code.');
    await this.prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null, backupCodes: [] } });
    await this.notifications.notify(user.id, {
      category: 'SECURITY',
      type: '2FA_DISABLED',
      title: 'Two-factor authentication disabled',
      body: 'Two-factor authentication was turned off.',
      email: { template: 'two-factor', data: { enabled: false } },
    });
    return { ok: true };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('pin')
  async setPin(@CurrentUser() user: User, @Body() body: unknown) {
    const input = parse(setPinSchema, body);
    if (!(await argon2.verify(user.passwordHash, input.password))) throw new AppError('INVALID_CREDENTIALS', 'Your password is incorrect.');
    if (/^(\d)\1{3}$/.test(input.pin) || ['1234', '4321', '0000'].includes(input.pin)) throw new AppError('VALIDATION', 'Choose a less predictable PIN.');
    await this.prisma.user.update({ where: { id: user.id }, data: { transactionPinHash: await argon2.hash(input.pin), pinFailedAttempts: 0, pinLockedUntil: null } });
    await this.notifications.notify(user.id, { category: 'SECURITY', type: 'PIN_SET', title: user.transactionPinHash ? 'Transaction PIN changed' : 'Transaction PIN created', body: 'Your transaction PIN was updated.', skipEmail: true });
    return { ok: true };
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(200)
  @Post('pin/forgot')
  async forgotPin(@CurrentUser() user: User) {
    const code = randomDigits(6);
    await this.auth.issueToken('PIN_RESET', { userId: user.id, ttlMinutes: 15, token: `${user.id}:${code}` });
    await this.mail.send(user.email, 'pin-reset', { code });
    return { message: 'We emailed you a 6-digit code.' };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('pin/reset')
  async resetPin(@CurrentUser() user: User, @Body() body: unknown) {
    const input = parse(resetPinSchema, body);
    await this.auth.consumeToken('PIN_RESET', `${user.id}:${input.token}`);
    await this.prisma.user.update({ where: { id: user.id }, data: { transactionPinHash: await argon2.hash(input.pin), pinFailedAttempts: 0, pinLockedUntil: null } });
    await this.notifications.notify(user.id, { category: 'SECURITY', type: 'PIN_RESET', title: 'Transaction PIN reset', body: 'Your transaction PIN was reset.', skipEmail: true });
    return { ok: true };
  }

  @HttpCode(200)
  @Post('pin/verify')
  async verifyPin(@CurrentUser() user: User, @Body() body: unknown) {
    const { pin } = parse(z.object({ pin: pinSchema }), body);
    await this.guard.verifyPin(user, pin);
    return { ok: true };
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(200)
  @Post('otp')
  sendOtp(@CurrentUser() user: User) {
    return this.guard.sendOtp(user);
  }

  @Get('limits')
  limits(@CurrentUser() user: User) {
    return this.guard.limits(user);
  }

  // ---------- notifications ----------

  @Get('notifications')
  async notificationsList(@CurrentUser() user: User, @Query('page') page = '1', @Query('unread') unread?: string) {
    const take = 20;
    const where = { userId: user.id, ...(unread === 'true' ? { readAt: null } : {}) };
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip: (Math.max(1, Number(page)) - 1) * take }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return { items, total, unreadCount, page: Number(page), pages: Math.ceil(total / take) };
  }

  @HttpCode(200)
  @Post('notifications/read')
  async markRead(@CurrentUser() user: User, @Body() body: unknown) {
    const { ids } = parse(z.object({ ids: z.array(z.string()).optional() }), body);
    await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Get('notification-preferences')
  async prefs(@CurrentUser() user: User) {
    const rows = await this.prisma.notificationPreference.findMany({ where: { userId: user.id } });
    return NOTIFICATION_CATEGORIES.map((category) => {
      const r = rows.find((x) => x.category === category);
      return { category, inApp: r?.inApp ?? true, email: r?.email ?? category !== 'MARKETING', locked: category === 'SECURITY' };
    });
  }

  @Put('notification-preferences')
  async setPrefs(@CurrentUser() user: User, @Body() body: unknown) {
    const items = parse(z.array(z.object({ category: z.enum(NOTIFICATION_CATEGORIES), inApp: z.boolean(), email: z.boolean() })), body);
    for (const p of items) {
      if (p.category === 'SECURITY') continue;
      await this.prisma.notificationPreference.upsert({
        where: { userId_category: { userId: user.id, category: p.category } },
        create: { userId: user.id, ...p },
        update: { inApp: p.inApp, email: p.email },
      });
    }
    return this.prefs(user);
  }

  /** Server-Sent Events: live notifications + balance changes. */
  @Sse('stream')
  stream(@CurrentUser() user: User): Observable<{ data: unknown; type?: string }> {
    const heartbeat = interval(25_000).pipe(map(() => ({ type: 'ping', data: { t: Date.now() } })));
    return merge(this.notifications.stream(user.id), heartbeat);
  }

  // ---------- misc ----------

  @Get('referrals')
  async referrals(@CurrentUser() user: User) {
    const rows = await this.prisma.referral.findMany({ where: { referrerId: user.id }, orderBy: { createdAt: 'desc' } });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.refereeId) } }, select: { id: true, firstName: true, lastName: true, kycLevel: true, createdAt: true } });
    return {
      code: user.referralCode,
      link: `${config.webUrl}/signup?ref=${user.referralCode}`,
      referrals: rows.map((r) => {
        const u = users.find((x) => x.id === r.refereeId);
        return { id: r.id, name: u ? `${u.firstName} ${u.lastName.charAt(0)}.` : 'User', joinedAt: u?.createdAt, bonusPaid: r.bonusPaid };
      }),
    };
  }

  @Get('announcements')
  announcements() {
    const now = new Date();
    return this.prisma.announcement.findMany({
      where: { active: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
  }

  @HttpCode(200)
  @Post('close-account')
  async close(@CurrentUser() user: User, @Body() body: unknown) {
    const { password, reason } = parse(z.object({ password: z.string(), reason: z.string().max(500).optional() }), body);
    if (!(await argon2.verify(user.passwordHash, password))) throw new AppError('INVALID_CREDENTIALS', 'Your password is incorrect.');
    const funded = await this.prisma.ledgerAccount.findFirst({ where: { ownerId: user.id, balance: { not: 0 } } });
    if (funded) throw new AppError('CONFLICT', 'Please withdraw or transfer all balances (including savings and cards) before closing your account.');
    const loan = await this.prisma.loan.findFirst({ where: { userId: user.id, status: { in: ['APPLIED', 'APPROVED', 'DISBURSED'] } } });
    if (loan) throw new AppError('CONFLICT', 'You have an active loan or application.');
    await this.prisma.user.update({ where: { id: user.id }, data: { status: 'CLOSED', statusReason: reason ?? 'Closed by customer' } });
    await this.prisma.ledgerAccount.updateMany({ where: { ownerId: user.id }, data: { status: 'CLOSED' } });
    await this.sessions.revokeWhere({ userId: user.id }, 'Account closed');
    await this.audit.log({ type: 'USER', id: user.id, email: user.email }, 'user.close_account', { type: 'User', id: user.id }, { reason });
    return { ok: true };
  }
}
