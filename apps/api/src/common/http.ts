import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID, timingSafeEqual } from 'crypto';
import { UAParser } from 'ua-parser-js';
import type { ZodTypeAny, z } from 'zod';

/** Parse request input with a shared zod schema; ZodError is mapped by the global filter. */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  return schema.parse(input);
}

export interface DeviceInfo {
  ip: string;
  userAgent: string;
  browser: string;
  os: string;
  deviceType: string;
  location: string;
}

/**
 * Client IP as resolved by Express using the `trust proxy` setting (main.ts trusts TRUST_PROXY_HOPS hops).
 * Never read X-Forwarded-For directly: its first entry is client-controlled.
 */
export function clientIp(req: Request): string {
  return (req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '');
}

export function deviceInfo(req: Request): DeviceInfo {
  const ua = req.headers['user-agent'] ?? '';
  const parsed = new UAParser(ua).getResult();
  const ip = clientIp(req);
  const city = (req.headers['cf-ipcity'] as string) || (req.headers['x-vercel-ip-city'] as string) || '';
  const country = (req.headers['cf-ipcountry'] as string) || (req.headers['x-vercel-ip-country'] as string) || '';
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.');
  const location = city || country ? [decodeURIComponent(city), country].filter(Boolean).join(', ') : isLocal ? 'Local network' : 'Unknown';
  return {
    ip,
    userAgent: ua.slice(0, 500),
    browser: [parsed.browser.name, parsed.browser.major].filter(Boolean).join(' ') || 'Unknown',
    os: [parsed.os.name, parsed.os.version].filter(Boolean).join(' ') || 'Unknown',
    deviceType: parsed.device.type ?? 'desktop',
    location,
  };
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');
  use(req: Request & { requestId?: string }, res: Response, next: NextFunction) {
    const id = (req.headers['x-request-id'] as string) || randomUUID();
    req.requestId = id;
    res.setHeader('x-request-id', id);
    const start = Date.now();
    res.on('finish', () => {
      if (req.originalUrl.includes('/stream')) return;
      this.logger.log(JSON.stringify({ requestId: id, method: req.method, url: req.originalUrl, status: res.statusCode, ms: Date.now() - start }));
    });
    next();
  }
}

function csrfCookies(req: Request): string[] {
  const raw = req.headers.cookie ?? '';
  return raw
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p.startsWith('ob_csrf='))
    .map((p) => {
      try {
        return decodeURIComponent(p.slice('ob_csrf='.length));
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

/**
 * Double-submit CSRF protection for cookie-authenticated mutations.
 * GET /csrf sets a readable `ob_csrf` cookie; clients echo it in `x-csrf-token`.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const header = req.headers['x-csrf-token'] as string | undefined;
    // A browser can hold several `ob_csrf` cookies (e.g. a stale host-only one from before COOKIE_DOMAIN
    // was set); cookie-parser keeps only the first, so match the header against every copy sent.
    const cookies = csrfCookies(req);
    const ok = !!header && cookies.some((c) => c.length === header.length && timingSafeEqual(Buffer.from(c), Buffer.from(header)));
    if (!ok) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Invalid or missing CSRF token. Refresh the page and try again.' } });
      return;
    }
    next();
  }
}
