import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from './app-error';

@Catch()
export class GlobalErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = req.requestId;
    if (res.headersSent) return;

    if (exception instanceof AppError) {
      const body = exception.getResponse() as { code: string; message: string; details?: unknown };
      return res.status(exception.getStatus()).json({ error: { ...body, requestId } });
    }
    if (exception instanceof ZodError) {
      const details = exception.flatten().fieldErrors;
      const first = exception.issues[0];
      const where = first?.path.join('.') || 'input';
      return res.status(400).json({
        error: { code: 'VALIDATION', message: first ? `${where}: ${first.message}` : 'Invalid input', details, requestId },
      });
    }
    if (exception instanceof ThrottlerException) {
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.', requestId } });
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const r = exception.getResponse();
      const message = typeof r === 'string' ? r : ((r as { message?: string | string[] }).message ?? exception.message);
      const code = status === 404 ? 'NOT_FOUND' : status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'VALIDATION';
      return res.status(status).json({ error: { code, message: Array.isArray(message) ? message.join(', ') : message, requestId } });
    }
    this.logger.error(`[${requestId}] ${req.method} ${req.url}`, exception instanceof Error ? exception.stack : String(exception));
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.', requestId } });
  }
}
