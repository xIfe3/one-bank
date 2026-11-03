import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@onebank/shared';

const STATUS: Partial<Record<ErrorCode, number>> = {
  VALIDATION: HttpStatus.BAD_REQUEST,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  INVALID_TOKEN: HttpStatus.BAD_REQUEST,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  ACCOUNT_SUSPENDED: HttpStatus.FORBIDDEN,
  ACCOUNT_BLOCKED: HttpStatus.FORBIDDEN,
  ACCOUNT_LOCKED: HttpStatus.LOCKED,
  PIN_LOCKED: HttpStatus.LOCKED,
  EMAIL_NOT_VERIFIED: HttpStatus.FORBIDDEN,
  KYC_REQUIRED: HttpStatus.FORBIDDEN,
  FEATURE_DISABLED: HttpStatus.FORBIDDEN,
  ACCOUNT_FROZEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  MAINTENANCE: HttpStatus.SERVICE_UNAVAILABLE,
  INSUFFICIENT_FUNDS: HttpStatus.UNPROCESSABLE_ENTITY,
  LIMIT_EXCEEDED: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_PIN: HttpStatus.UNPROCESSABLE_ENTITY,
  PIN_NOT_SET: HttpStatus.UNPROCESSABLE_ENTITY,
  TWO_FACTOR_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_2FA: HttpStatus.UNPROCESSABLE_ENTITY,
};

export class AppError extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
    status?: number,
  ) {
    super({ code, message, details }, status ?? STATUS[code] ?? HttpStatus.BAD_REQUEST);
  }
}

export const notFound = (what = 'Resource') => new AppError('NOT_FOUND', `${what} not found`);
