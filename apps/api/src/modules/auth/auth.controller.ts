import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  twoFactorLoginSchema,
} from '@onebank/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../../config';
import { AppError } from '../../common/app-error';
import { randomToken } from '../../common/crypto';
import { deviceInfo, parse } from '../../common/http';
import { AuthService } from './auth.service';
import { SessionId, UserAuthGuard } from './guards';
import { SessionService } from './session.service';

const STRICT = { default: { limit: 10, ttl: 60_000 } };

@Controller()
export class CsrfController {
  /** Issues the double-submit CSRF cookie. */
  @Get('csrf')
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const existing = req.cookies?.ob_csrf as string | undefined;
    const token = existing && existing.length === 43 ? existing : randomToken(32);
    res.cookie('ob_csrf', token, { httpOnly: false, sameSite: 'lax', secure: config.cookieSecure, path: '/', domain: config.cookieDomain, maxAge: 7 * 24 * 3600 * 1000 });
    return { csrfToken: token };
  }
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Throttle(STRICT)
  @Post('signup')
  async signup(@Body() body: unknown) {
    const input = parse(signupSchema, body);
    await this.auth.signup(input);
    return { message: 'Check your inbox to verify your email address.', email: input.email };
  }

  @Throttle(STRICT)
  @HttpCode(200)
  @Post('verify-email')
  async verify(@Body() body: unknown) {
    const { token } = parse(z.object({ token: z.string().min(10) }), body);
    return this.auth.verifyEmail(token);
  }

  @Throttle(STRICT)
  @HttpCode(200)
  @Post('resend-verification')
  async resend(@Body() body: unknown) {
    const { email } = parse(forgotPasswordSchema, body);
    await this.auth.resendVerification(email);
    return { message: 'If your account needs verification, a new link is on its way.' };
  }

  @Throttle(STRICT)
  @HttpCode(200)
  @Post('login')
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const input = parse(loginSchema, body);
    const result = await this.auth.login(input.email, input.password, input.rememberMe, deviceInfo(req));
    if (result.twoFactorRequired) return { twoFactorRequired: true, challengeToken: result.challengeToken };
    this.sessions.setCookies(res, 'user', result.tokens);
    return { twoFactorRequired: false, user: { id: result.user.id, firstName: result.user.firstName } };
  }

  @Throttle(STRICT)
  @HttpCode(200)
  @Post('login/2fa')
  async login2fa(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const input = parse(twoFactorLoginSchema, body);
    const result = await this.auth.loginTwoFactor(input.challengeToken, input.code, deviceInfo(req));
    this.sessions.setCookies(res, 'user', result.tokens);
    return { twoFactorRequired: false, user: { id: result.user.id, firstName: result.user.firstName } };
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[this.sessions.cookieNames('user').refresh] as string | undefined;
    const result = token ? await this.sessions.rotate('user', token, deviceInfo(req)) : null;
    if (!result || result.reuse) {
      this.sessions.clearCookies(res, 'user');
      throw new AppError('UNAUTHORIZED', result?.reuse ? 'For your security, please sign in again.' : 'Your session has expired. Please sign in again.');
    }
    this.sessions.setCookies(res, 'user', result);
    return { ok: true };
  }

  @HttpCode(200)
  @UseGuards(UserAuthGuard)
  @Post('logout')
  async logout(@SessionId() sid: string, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(sid, 'Signed out');
    this.sessions.clearCookies(res, 'user');
    return { ok: true };
  }

  @Throttle(STRICT)
  @HttpCode(200)
  @Post('forgot-password')
  async forgot(@Body() body: unknown) {
    const { email } = parse(forgotPasswordSchema, body);
    await this.auth.forgotPassword(email);
    return { message: 'If an account exists for that email, you will receive a reset link shortly.' };
  }

  @Throttle(STRICT)
  @HttpCode(200)
  @Post('reset-password')
  async reset(@Body() body: unknown) {
    const { token, password } = parse(resetPasswordSchema, body);
    await this.auth.resetPassword(token, password);
    return { message: 'Your password has been reset. Please sign in.' };
  }

  @Throttle(STRICT)
  @HttpCode(200)
  @Post('secure-account')
  async secure(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { token } = parse(z.object({ token: z.string().min(10) }), body);
    const result = await this.auth.secureAccount(token);
    this.sessions.clearCookies(res, 'user');
    return result;
  }

  @Throttle(STRICT)
  @HttpCode(200)
  @Post('confirm-email-change')
  async confirmEmail(@Body() body: unknown) {
    const { token } = parse(z.object({ token: z.string().min(10) }), body);
    return this.auth.confirmEmailChange(token);
  }
}
