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

export function clientIp(req: Request): string {
  const fwd = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  return (fwd || req.socket?.remoteAddress || '').replace('::ffff:', '');
}

export function deviceInfo(req: Request): DeviceInfo {
  const ua = req.headers['user-agent'] ?? '';
  const parsed = new UAParser(ua).getResult();
  const ip = clientIp(req);
  const city = (req.headers['x-vercel-ip-city'] as string) || '';
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

/**
 * Double-submit CSRF protection for cookie-authenticated mutations.
 * GET /csrf sets a readable `ob_csrf` cookie; clients echo it in `x-csrf-token`.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const cookie = req.cookies?.ob_csrf as string | undefined;
    const header = req.headers['x-csrf-token'] as string | undefined;
    if (!cookie || !header || cookie.length !== header.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Invalid or missing CSRF token. Refresh the page and try again.' } });
      return;
    }
    next();
  }
}
