import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { SettingsService } from './settings.service';

const ALWAYS_OPEN = ['/api/v1/admin', '/api/v1/public/status', '/api/v1/csrf', '/api/v1/health'];

/** While maintenance mode is on, customer routes return 503; admin keeps working. */
@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  constructor(private readonly settings: SettingsService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    if (ALWAYS_OPEN.some((p) => req.originalUrl.startsWith(p))) return next();
    const s = await this.settings.get();
    if (!s.maintenanceMode) return next();
    res.setHeader('Retry-After', '300');
    res.status(503).json({ error: { code: 'MAINTENANCE', message: s.maintenanceMessage, details: { eta: s.maintenanceEta } } });
  }
}
