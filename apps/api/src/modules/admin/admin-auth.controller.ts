import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AdminUser } from '@prisma/client';
import { passwordSchema } from '@onebank/shared';
import argon2 from 'argon2';
import type { Request, Response } from 'express';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { z } from 'zod';
import { AppError } from '../../common/app-error';
import { decrypt, encrypt, randomToken } from '../../common/crypto';
import { deviceInfo, parse } from '../../common/http';
import { PrismaService, RedisService } from '../../common/infra';
import { AuthService } from '../auth/auth.service';
import { AdminAuthGuard, CurrentAdmin, SessionId } from '../auth/guards';
import { SessionService } from '../auth/session.service';
import { AuditService } from '../core/audit.service';

const STRICT = { default: { limit: 10, ttl: 60_000 } };

export function publicAdmin(a: AdminUser) {
  return { id: a.id, email: a.email, firstName: a.firstName, lastName: a.lastName, role: a.role, status: a.status, twoFactorEnabled: a.twoFactorEnabled, lastLoginAt: a.lastLoginAt };
}

/** Admin login is always 2-step: password, then TOTP (set up on first login). */
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly sessions: SessionService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Throttle(STRICT)
  @HttpCode(200)
  @Post('login')
  async login(@Body() body: unknown, @Req() req: Request) {
    const { email, password } = parse(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }), body);
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    const device = deviceInfo(req);
    const fail = async (reason: string) => {
      await this.prisma.loginEvent.create({ data: { adminId: admin?.id, email, success: false, reason, ip: device.ip, userAgent: device.userAgent, browser: device.browser, os: device.os, location: device.location } });
      await this.audit.log({ type: 'ADMIN', id: admin?.id, email, ip: device.ip }, 'admin.login_failed', undefined, { reason });
    };
    if (!admin || !admin.passwordHash) {
      await argon2.hash(password);
      await fail('unknown');
      throw new AppError('INVALID_CREDENTIALS', 'Incorrect email or password.');
    }
    if (admin.lockedUntil && admin.lockedUntil > new Date()) throw new AppError('ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.');
    if (!(await argon2.verify(admin.passwordHash, password))) {
      const n = admin.failedLoginCount + 1;
      await this.prisma.adminUser.update({ where: { id: admin.id }, data: { failedLoginCount: n >= 5 ? 0 : n, lockedUntil: n >= 5 ? new Date(Date.now() + 30 * 60_000) : undefined } });
      await fail('bad_password');
      throw new AppError('INVALID_CREDENTIALS', 'Incorrect email or password.');
    }
    if (admin.status !== 'ACTIVE') throw new AppError('ACCOUNT_BLOCKED', 'This admin account is disabled.');
    const challengeToken = randomToken(24);
    if (!admin.twoFactorEnabled) {
      const secret = authenticator.generateSecret();
      await this.redis.setJson(`a2fa:${challengeToken}`, { adminId: admin.id, setupSecret: encrypt(secret) }, 600);
      const otpauth = authenticator.keyuri(admin.email, 'One Bank Admin', secret);
      return { setupRequired: true, challengeToken, secret, qr: await QRCode.toDataURL(otpauth, { margin: 1, width: 220 }) };
    }
    await this.redis.setJson(`a2fa:${challengeToken}`, { adminId: admin.id }, 300);
    return { twoFactorRequired: true, challengeToken };
  }

  @Throttle(STRICT)
  @HttpCode(200)
  @Post('login/2fa')
  async login2fa(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { challengeToken, code } = parse(z.object({ challengeToken: z.string(), code: z.string().regex(/^\d{6}$/) }), body);
    const key = `a2fa:${challengeToken}`;
    const ch = await this.redis.getJson<{ adminId: string; setupSecret?: string; attempts?: number }>(key);
    if (!ch) throw new AppError('INVALID_TOKEN', 'Sign-in expired. Please start again.');
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: ch.adminId } });
    if (admin.lockedUntil && admin.lockedUntil > new Date()) throw new AppError('ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.');
    const secret = ch.setupSecret ?? admin.twoFactorSecret;
    if (!secret || !authenticator.check(code, decrypt(secret))) {
      // 3 tries per challenge; 5 consecutive failures lock the admin for 30 minutes.
      const attempts = (ch.attempts ?? 0) + 1;
      if (attempts >= 3) await this.redis.client.del(key);
      else await this.redis.setJson(key, { ...ch, attempts }, ch.setupSecret ? 600 : 300);
      const n = admin.failedLoginCount + 1;
      await this.prisma.adminUser.update({ where: { id: admin.id }, data: { failedLoginCount: n >= 5 ? 0 : n, lockedUntil: n >= 5 ? new Date(Date.now() + 30 * 60_000) : undefined } });
      await this.audit.log({ type: 'ADMIN', id: admin.id, email: admin.email, ip: deviceInfo(req).ip }, 'admin.2fa_failed');
      throw new AppError('INVALID_2FA', attempts >= 3 ? 'Too many incorrect codes. Please sign in again.' : 'Invalid authentication code.');
    }
    await this.redis.client.del(`a2fa:${challengeToken}`);
    const device = deviceInfo(req);
    const updated = await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { failedLoginCount: 0, lastLoginAt: new Date(), ...(ch.setupSecret ? { twoFactorEnabled: true, twoFactorSecret: ch.setupSecret } : {}) },
    });
    const tokens = await this.sessions.create('admin', admin.id, device, { role: admin.role });
    this.sessions.setCookies(res, 'admin', tokens);
    await this.prisma.loginEvent.create({ data: { adminId: admin.id, email: admin.email, success: true, ip: device.ip, userAgent: device.userAgent, browser: device.browser, os: device.os, location: device.location } });
    await this.audit.log({ type: 'ADMIN', id: admin.id, email: admin.email, ip: device.ip }, ch.setupSecret ? 'admin.2fa_setup_and_login' : 'admin.login');
    return { admin: publicAdmin(updated) };
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[this.sessions.cookieNames('admin').refresh] as string | undefined;
    const result = token ? await this.sessions.rotate('admin', token, deviceInfo(req)) : null;
    if (!result || result.reuse) {
      this.sessions.clearCookies(res, 'admin');
      throw new AppError('UNAUTHORIZED', 'Admin session expired. Please sign in again.');
    }
    this.sessions.setCookies(res, 'admin', result);
    return { ok: true };
  }

  @UseGuards(AdminAuthGuard)
  @HttpCode(200)
  @Post('logout')
  async logout(@SessionId() sid: string, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(sid, 'Signed out');
    this.sessions.clearCookies(res, 'admin');
    return { ok: true };
  }

  @UseGuards(AdminAuthGuard)
  @Get('me')
  me(@CurrentAdmin() admin: AdminUser) {
    return publicAdmin(admin);
  }

  @UseGuards(AdminAuthGuard)
  @HttpCode(200)
  @Post('password')
  async changePassword(@CurrentAdmin() admin: AdminUser, @SessionId() sid: string, @Body() body: unknown) {
    const { currentPassword, newPassword } = parse(z.object({ currentPassword: z.string(), newPassword: passwordSchema }), body);
    if (!admin.passwordHash || !(await argon2.verify(admin.passwordHash, currentPassword))) throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect.');
    await this.prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash: await argon2.hash(newPassword) } });
    await this.sessions.revokeWhere({ adminId: admin.id, NOT: { id: sid } }, 'Password changed');
    await this.audit.log({ type: 'ADMIN', id: admin.id, email: admin.email }, 'admin.password_changed');
    return { ok: true };
  }

  @Throttle(STRICT)
  @HttpCode(200)
  @Post('accept-invite')
  async acceptInvite(@Body() body: unknown) {
    const { token, password } = parse(z.object({ token: z.string().min(10), password: passwordSchema }), body);
    const row = await this.auth.consumeToken('ADMIN_INVITE', token);
    const admin = await this.prisma.adminUser.update({ where: { id: row.adminId! }, data: { passwordHash: await argon2.hash(password), status: 'ACTIVE' } });
    await this.audit.log({ type: 'ADMIN', id: admin.id, email: admin.email }, 'admin.invite_accepted');
    return { email: admin.email };
  }
}
