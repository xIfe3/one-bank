import { Injectable } from '@nestjs/common';
import type { TokenType, User } from '@prisma/client';
import { type SignupInput } from '@onebank/shared';
import argon2 from 'argon2';
import { authenticator } from 'otplib';
import { config } from '../../config';
import { AppError } from '../../common/app-error';
import { decrypt, generateAccountNumber, randomCode, randomToken, sha256 } from '../../common/crypto';
import type { DeviceInfo } from '../../common/http';
import { PrismaService, RedisService } from '../../common/infra';
import { AuditService } from '../core/audit.service';
import { MailService } from '../core/mail.service';
import { NotificationsService } from '../core/notifications.service';
import { SettingsService } from '../core/settings.service';
import { SessionService } from './session.service';

const COMMON_PASSWORDS = new Set([
  'password123', 'Password123', 'Password1234', 'Qwerty123456', 'Welcome12345', 'Iloveyou1234', 'Admin1234567', 'Letmein12345', 'Password12345',
]);

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  // ---------- tokens ----------

  async issueToken(type: TokenType, opts: { userId?: string; adminId?: string; ttlMinutes: number; payload?: object; token?: string }) {
    const token = opts.token ?? randomToken(32);
    // Invalidate older unused tokens of the same type.
    if (opts.userId) await this.prisma.verificationToken.updateMany({ where: { userId: opts.userId, type, usedAt: null }, data: { usedAt: new Date() } });
    if (opts.adminId) await this.prisma.verificationToken.updateMany({ where: { adminId: opts.adminId, type, usedAt: null }, data: { usedAt: new Date() } });
    await this.prisma.verificationToken.create({
      data: { type, tokenHash: sha256(token), userId: opts.userId, adminId: opts.adminId, payload: opts.payload, expiresAt: new Date(Date.now() + opts.ttlMinutes * 60_000) },
    });
    return token;
  }

  async consumeToken(type: TokenType, token: string) {
    const row = await this.prisma.verificationToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) {
      throw new AppError('INVALID_TOKEN', 'This link is invalid or has expired. Please request a new one.');
    }
    await this.prisma.verificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    return row;
  }

  // ---------- signup & verification ----------

  async signup(input: SignupInput) {
    const s = await this.settings.get();
    if (!s.features.signups) throw new AppError('FEATURE_DISABLED', 'New sign-ups are temporarily paused. Please check back soon.');
    if (COMMON_PASSWORDS.has(input.password)) throw new AppError('VALIDATION', 'This password is too common. Please choose another.');
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      // Do not leak account existence: behave as if created, but email the owner.
      if (existing.status === 'PENDING_VERIFICATION') await this.sendVerification(existing);
      return { email: input.email };
    }
    const referrer = input.referralCode ? await this.prisma.user.findUnique({ where: { referralCode: input.referralCode.toUpperCase() } }) : null;
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await argon2.hash(input.password),
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        country: input.country.toUpperCase(),
        dateOfBirth: input.dateOfBirth,
        addressLine1: input.addressLine1,
        city: input.city,
        state: input.state ?? '',
        postalCode: input.postalCode ?? '',
        baseCurrency: input.baseCurrency,
        referralCode: randomCode(8),
        referredById: referrer?.id,
        notificationPrefs: {
          create: ['SECURITY', 'TRANSACTIONS', 'ACCOUNT', 'SUPPORT', 'MARKETING'].map((category) => ({ category, inApp: true, email: category !== 'MARKETING' })),
        },
      },
    });
    if (referrer) await this.prisma.referral.create({ data: { referrerId: referrer.id, refereeId: user.id } });
    await this.sendVerification(user);
    return { email: user.email };
  }

  async sendVerification(user: User) {
    const throttle = await this.redis.client.set(`verify:throttle:${user.id}`, '1', 'EX', 60, 'NX');
    if (!throttle) return;
    const token = await this.issueToken('EMAIL_VERIFY', { userId: user.id, ttlMinutes: 24 * 60 });
    await this.mail.send(user.email, 'verify-email', { firstName: user.firstName, url: `${config.webUrl}/verify-email?token=${token}` });
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && user.status === 'PENDING_VERIFICATION') await this.sendVerification(user);
  }

  async verifyEmail(token: string) {
    const row = await this.consumeToken('EMAIL_VERIFY', token);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: row.userId! } });
    if (user.status !== 'PENDING_VERIFICATION') return { alreadyVerified: true };
    const accountNumber = await this.uniqueAccountNumber();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE', emailVerifiedAt: new Date(), kycLevel: Math.max(user.kycLevel, user.phone && user.dateOfBirth ? 1 : 0) } }),
      this.prisma.ledgerAccount.create({
        data: { type: 'CUSTOMER_WALLET', currency: user.baseCurrency, ownerId: user.id, accountNumber, name: `${user.baseCurrency} Account`, isPrimary: true },
      }),
    ]);
    await this.notifications.notify(user.id, {
      category: 'ACCOUNT',
      type: 'WELCOME',
      title: 'Welcome to One Bank 🎉',
      body: `Your ${user.baseCurrency} account ${accountNumber} is ready. Set your transaction PIN to start sending money.`,
      link: '/app/settings/security',
      email: { template: 'welcome', data: { currency: user.baseCurrency, accountNumber } },
    });
    return { alreadyVerified: false };
  }

  async uniqueAccountNumber(): Promise<string> {
    for (;;) {
      const n = generateAccountNumber();
      if (!(await this.prisma.ledgerAccount.findUnique({ where: { accountNumber: n } }))) return n;
    }
  }

  // ---------- login ----------

  async login(email: string, password: string, rememberMe: boolean, device: DeviceInfo) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const fail = async (reason: string) => {
      await this.prisma.loginEvent.create({ data: { userId: user?.id, email, success: false, reason, ...this.eventDevice(device) } });
    };
    if (!user) {
      await argon2.hash(password); // equalize timing
      await fail('unknown_email');
      throw new AppError('INVALID_CREDENTIALS', 'Incorrect email or password.');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await fail('locked');
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new AppError('ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${mins} minute(s) or reset your password.`);
    }
    if (!(await argon2.verify(user.passwordHash, password))) {
      const count = user.failedLoginCount + 1;
      const lock = count >= LOCK_AFTER;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: lock ? 0 : count, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined },
      });
      await fail('bad_password');
      if (lock) {
        await this.mail.send(user.email, 'account-locked', { minutes: LOCK_MINUTES });
        throw new AppError('ACCOUNT_LOCKED', `Too many failed attempts. Sign-in is locked for ${LOCK_MINUTES} minutes.`);
      }
      throw new AppError('INVALID_CREDENTIALS', 'Incorrect email or password.');
    }
    if (user.status === 'BLOCKED') {
      await fail('blocked');
      throw new AppError('ACCOUNT_BLOCKED', `Your account has been blocked${user.statusReason ? `: ${user.statusReason}` : ''}. Please contact support.`);
    }
    if (user.status === 'CLOSED') {
      await fail('closed');
      throw new AppError('ACCOUNT_BLOCKED', 'This account has been closed.');
    }
    if (user.status === 'PENDING_VERIFICATION') {
      await this.sendVerification(user);
      throw new AppError('EMAIL_NOT_VERIFIED', 'Please verify your email. We have sent you a new verification link.', { email: user.email });
    }
    if (user.twoFactorEnabled) {
      const challengeToken = randomToken(24);
      await this.redis.setJson(`2fa:${challengeToken}`, { userId: user.id, rememberMe }, 300);
      return { twoFactorRequired: true as const, challengeToken };
    }
    return this.completeLogin(user, rememberMe, device);
  }

  async loginTwoFactor(challengeToken: string, code: string, device: DeviceInfo) {
    const ch = await this.redis.getJson<{ userId: string; rememberMe: boolean; attempts?: number }>(`2fa:${challengeToken}`);
    if (!ch) throw new AppError('INVALID_TOKEN', 'Your sign-in session expired. Please sign in again.');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: ch.userId } });
    if (!(await this.checkTwoFactor(user, code))) {
      const attempts = (ch.attempts ?? 0) + 1;
      if (attempts >= 5) await this.redis.client.del(`2fa:${challengeToken}`);
      else await this.redis.setJson(`2fa:${challengeToken}`, { ...ch, attempts }, 300);
      await this.prisma.loginEvent.create({ data: { userId: user.id, email: user.email, success: false, reason: 'bad_2fa', ...this.eventDevice(device) } });
      throw new AppError('INVALID_2FA', 'Invalid authentication code.');
    }
    await this.redis.client.del(`2fa:${challengeToken}`);
    return this.completeLogin(user, ch.rememberMe, device);
  }

  /** TOTP or one-time backup code. */
  async checkTwoFactor(user: { id: string; twoFactorSecret: string | null; backupCodes: string[] }, code: string): Promise<boolean> {
    const clean = code.replace(/\s|-/g, '');
    if (user.twoFactorSecret && /^\d{6}$/.test(clean) && authenticator.check(clean, decrypt(user.twoFactorSecret))) return true;
    const hash = sha256(clean.toUpperCase());
    if (user.backupCodes.includes(hash)) {
      await this.prisma.user.update({ where: { id: user.id }, data: { backupCodes: user.backupCodes.filter((c) => c !== hash) } });
      return true;
    }
    return false;
  }

  private eventDevice(d: DeviceInfo) {
    return { ip: d.ip, userAgent: d.userAgent, browser: d.browser, os: d.os, location: d.location };
  }

  private async completeLogin(user: User, rememberMe: boolean, device: DeviceInfo) {
    const knownDevice = await this.prisma.loginEvent.findFirst({
      where: { userId: user.id, success: true, OR: [{ ip: device.ip }, { browser: device.browser, os: device.os }] },
    });
    const isFirstLogin = !(await this.prisma.loginEvent.findFirst({ where: { userId: user.id, success: true } }));
    const tokens = await this.sessions.create('user', user.id, device, { rememberMe });
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await this.prisma.loginEvent.create({ data: { userId: user.id, email: user.email, success: true, ...this.eventDevice(device) } });
    if (!knownDevice && !isFirstLogin) {
      const revokeToken = await this.issueToken('REVOKE_ALL', { userId: user.id, ttlMinutes: 7 * 24 * 60 });
      await this.notifications.notify(user.id, {
        category: 'SECURITY',
        type: 'NEW_LOGIN',
        title: 'New sign-in detected',
        body: `${device.browser} on ${device.os} · ${device.location}`,
        link: '/app/settings/security',
        email: {
          template: 'new-login',
          data: { ...device, time: new Date().toUTCString(), revokeUrl: `${config.webUrl}/secure-account?token=${revokeToken}` },
        },
      });
    }
    return { twoFactorRequired: false as const, tokens, user };
  }

  async secureAccount(token: string) {
    const row = await this.consumeToken('REVOKE_ALL', token);
    const userId = row.userId!;
    await this.sessions.revokeWhere({ userId }, 'User reported unrecognised sign-in');
    const user = await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(randomToken(32)) } });
    const reset = await this.issueToken('PASSWORD_RESET', { userId, ttlMinutes: 30 });
    await this.mail.send(user.email, 'password-reset', { firstName: user.firstName, url: `${config.webUrl}/reset-password?token=${reset}` });
    await this.audit.log({ type: 'USER', id: userId }, 'user.secure_account');
    return { resetToken: reset };
  }

  // ---------- password reset ----------

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status === 'CLOSED') return;
    const ok = await this.redis.client.set(`reset:throttle:${user.id}`, '1', 'EX', 60, 'NX');
    if (!ok) return;
    const token = await this.issueToken('PASSWORD_RESET', { userId: user.id, ttlMinutes: 30 });
    await this.mail.send(user.email, 'password-reset', { firstName: user.firstName, url: `${config.webUrl}/reset-password?token=${token}` });
  }

  async resetPassword(token: string, password: string) {
    if (COMMON_PASSWORDS.has(password)) throw new AppError('VALIDATION', 'This password is too common. Please choose another.');
    const row = await this.consumeToken('PASSWORD_RESET', token);
    const user = await this.prisma.user.update({
      where: { id: row.userId! },
      data: { passwordHash: await argon2.hash(password), failedLoginCount: 0, lockedUntil: null },
    });
    await this.sessions.revokeWhere({ userId: user.id }, 'Password reset');
    await this.notifications.notify(user.id, {
      category: 'SECURITY',
      type: 'PASSWORD_CHANGED',
      title: 'Password changed',
      body: 'Your password was reset and all devices were signed out.',
      email: { template: 'password-changed', data: {} },
    });
  }

  async confirmEmailChange(token: string) {
    const row = await this.consumeToken('EMAIL_CHANGE', token);
    const newEmail = (row.payload as { newEmail: string }).newEmail;
    if (await this.prisma.user.findUnique({ where: { email: newEmail } })) throw new AppError('CONFLICT', 'That email is already in use.');
    const user = await this.prisma.user.update({ where: { id: row.userId! }, data: { email: newEmail } });
    await this.notifications.notify(user.id, { category: 'SECURITY', type: 'EMAIL_CHANGED', title: 'Email address updated', body: `Your sign-in email is now ${newEmail}.` });
    return { email: newEmail };
  }
}
