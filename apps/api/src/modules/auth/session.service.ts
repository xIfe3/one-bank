import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { AppError } from '../../common/app-error';
import { randomToken, sha256 } from '../../common/crypto';
import type { DeviceInfo } from '../../common/http';
import { PrismaService, RedisService } from '../../common/infra';

export type Realm = 'user' | 'admin';

export interface AccessClaims {
  sub: string;
  sid: string;
  realm: Realm;
  role?: string;
}

const COOKIES = {
  user: { access: 'ob_at', refresh: 'ob_rt' },
  admin: { access: 'oba_at', refresh: 'oba_rt' },
} as const;

const ACCESS_TTL_S = 15 * 60;

/**
 * Sessions = one row per device login. Refresh tokens are opaque, stored hashed, and rotate
 * on every use. Re-use of a rotated token revokes the whole family (token theft signal).
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  cookieNames(realm: Realm) {
    return COOKIES[realm];
  }

  private secret(realm: Realm) {
    return realm === 'admin' ? config.jwtAdminSecret : config.jwtAccessSecret;
  }

  signAccess(claims: AccessClaims): string {
    return jwt.sign(claims, this.secret(claims.realm), { expiresIn: ACCESS_TTL_S, issuer: 'onebank', audience: claims.realm });
  }

  verifyAccess(token: string, realm: Realm): AccessClaims | null {
    try {
      return jwt.verify(token, this.secret(realm), { issuer: 'onebank', audience: realm }) as AccessClaims;
    } catch {
      return null;
    }
  }

  async create(
    realm: Realm,
    ownerId: string,
    device: DeviceInfo,
    opts: { rememberMe?: boolean; role?: string },
  ): Promise<{ sessionId: string; access: string; refresh: string; maxAgeMs: number }> {
    const refresh = randomToken(48);
    const days = realm === 'admin' ? 8 / 24 : opts.rememberMe === false ? 7 : 30;
    const maxAgeMs = days * 24 * 3600 * 1000;
    const session = await this.prisma.session.create({
      data: {
        userId: realm === 'user' ? ownerId : undefined,
        adminId: realm === 'admin' ? ownerId : undefined,
        refreshTokenHash: sha256(refresh),
        familyId: randomToken(12),
        userAgent: device.userAgent,
        deviceType: device.deviceType,
        browser: device.browser,
        os: device.os,
        ip: device.ip,
        location: device.location,
        expiresAt: new Date(Date.now() + maxAgeMs),
      },
    });
    const access = this.signAccess({ sub: ownerId, sid: session.id, realm, role: opts.role });
    return { sessionId: session.id, access, refresh, maxAgeMs };
  }

  /** Rotate a refresh token. Returns null if invalid; revokes the family on reuse. */
  async rotate(realm: Realm, refresh: string, device: DeviceInfo) {
    const hash = sha256(refresh);
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: hash } });
    if (!session) {
      // Possible reuse of a rotated token: we keep previous hashes in Redis for detection.
      const familyId = await this.redis.client.get(`rt:used:${hash}`);
      if (familyId) {
        const revoked = await this.prisma.session.findMany({ where: { familyId, revokedAt: null } });
        await this.revokeWhere({ familyId }, 'Refresh token reuse detected');
        return { reuse: true as const, ownerId: revoked[0]?.userId ?? revoked[0]?.adminId ?? null };
      }
      return null;
    }
    const isRealm = realm === 'admin' ? !!session.adminId : !!session.userId;
    if (!isRealm || session.revokedAt || session.expiresAt < new Date()) return null;

    const next = randomToken(48);
    await this.redis.client.set(`rt:used:${hash}`, session.familyId, 'EX', 60 * 60 * 24 * 30);
    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: sha256(next), lastSeenAt: new Date(), ip: device.ip || session.ip, location: device.location || session.location },
    });
    const ownerId = (session.userId ?? session.adminId)!;
    let role: string | undefined;
    if (realm === 'admin') role = (await this.prisma.adminUser.findUnique({ where: { id: ownerId } }))?.role;
    const access = this.signAccess({ sub: ownerId, sid: session.id, realm, role });
    return { reuse: false as const, ownerId, sessionId: session.id, access, refresh: next, maxAgeMs: session.expiresAt.getTime() - Date.now() };
  }

  /** Session validity check with a 60s Redis cache; revocation deletes the cache key immediately. */
  async isActive(sessionId: string): Promise<boolean> {
    const key = `sess:${sessionId}`;
    const cached = await this.redis.client.get(key);
    if (cached !== null) {
      if (cached === '1') this.touch(sessionId);
      return cached === '1';
    }
    const s = await this.prisma.session.findUnique({ where: { id: sessionId }, select: { revokedAt: true, expiresAt: true } });
    const active = !!s && !s.revokedAt && s.expiresAt > new Date();
    await this.redis.client.set(key, active ? '1' : '0', 'EX', 60);
    if (active) this.touch(sessionId);
    return active;
  }

  private touch(sessionId: string) {
    // Update lastSeenAt at most once a minute per session.
    this.redis.client.set(`sess:touch:${sessionId}`, '1', 'EX', 60, 'NX').then((ok) => {
      if (ok) this.prisma.session.update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    });
  }

  async revoke(sessionId: string, reason: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
    await this.redis.client.set(`sess:${sessionId}`, '0', 'EX', 60);
  }

  async revokeWhere(where: { userId?: string; adminId?: string; familyId?: string; NOT?: { id: string } }, reason: string) {
    const sessions = await this.prisma.session.findMany({ where: { ...where, revokedAt: null }, select: { id: true } });
    if (!sessions.length) return 0;
    await this.prisma.session.updateMany({ where: { id: { in: sessions.map((s) => s.id) } }, data: { revokedAt: new Date(), revokedReason: reason } });
    const pipe = this.redis.client.pipeline();
    sessions.forEach((s) => pipe.set(`sess:${s.id}`, '0', 'EX', 60));
    await pipe.exec();
    return sessions.length;
  }

  setCookies(res: Response, realm: Realm, tokens: { access: string; refresh: string; maxAgeMs: number }) {
    const names = COOKIES[realm];
    const base = { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax' as const, domain: config.cookieDomain };
    res.cookie(names.access, tokens.access, { ...base, path: '/', maxAge: ACCESS_TTL_S * 1000 });
    res.cookie(names.refresh, tokens.refresh, { ...base, path: realm === 'admin' ? '/api/v1/admin/auth' : '/api/v1/auth', maxAge: tokens.maxAgeMs });
  }

  clearCookies(res: Response, realm: Realm) {
    const names = COOKIES[realm];
    const base = { domain: config.cookieDomain };
    res.clearCookie(names.access, { ...base, path: '/' });
    res.clearCookie(names.refresh, { ...base, path: realm === 'admin' ? '/api/v1/admin/auth' : '/api/v1/auth' });
  }

  requireValid(claims: AccessClaims | null): asserts claims is AccessClaims {
    if (!claims) throw new AppError('UNAUTHORIZED', 'Please sign in to continue.');
  }
}
