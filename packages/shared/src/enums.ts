export const USER_STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'CLOSED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ADMIN_ROLES = ['SUPERADMIN', 'ADMIN', 'SUPPORT', 'COMPLIANCE'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ENTRY_TYPES = [
  'DEPOSIT',
  'INTERNAL_TRANSFER',
  'INTERBANK',
  'WIRE',
  'BILL',
  'CARD_FUNDING',
  'CARD_WITHDRAWAL',
  'CARD_SPEND',
  'FX',
  'FEE',
  'ADMIN_CREDIT',
  'ADMIN_DEBIT',
  'REVERSAL',
  'INTEREST',
  'SAVINGS_TRANSFER',
  'LOAN_DISBURSE',
  'LOAN_REPAY',
  'REFERRAL_BONUS',
] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  DEPOSIT: 'Deposit',
  INTERNAL_TRANSFER: 'Transfer',
  INTERBANK: 'Bank transfer',
  WIRE: 'Wire transfer',
  BILL: 'Bill payment',
  CARD_FUNDING: 'Card funding',
  CARD_WITHDRAWAL: 'Card withdrawal',
  CARD_SPEND: 'Card purchase',
  FX: 'Currency exchange',
  FEE: 'Fee',
  ADMIN_CREDIT: 'Credit',
  ADMIN_DEBIT: 'Debit',
  REVERSAL: 'Reversal',
  INTEREST: 'Interest',
  SAVINGS_TRANSFER: 'Savings',
  LOAN_DISBURSE: 'Loan disbursement',
  LOAN_REPAY: 'Loan repayment',
  REFERRAL_BONUS: 'Referral bonus',
};

export const ENTRY_STATUSES = ['PENDING', 'COMPLETED', 'FAILED', 'REVERSED'] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const BILL_CATEGORIES = ['AIRTIME', 'DATA', 'ELECTRICITY', 'TV', 'INTERNET', 'WATER'] as const;
export type BillCategory = (typeof BILL_CATEGORIES)[number];

export const TICKET_CATEGORIES = ['ACCOUNT', 'TRANSACTION', 'CARD', 'LOAN', 'KYC', 'SECURITY', 'OTHER'] as const;
export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const TICKET_STATUSES = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const;

export const FEATURE_FLAGS = [
  'signups',
  'deposits',
  'internalTransfers',
  'interbank',
  'wire',
  'bills',
  'cards',
  'loans',
  'fx',
  'savings',
] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export const NOTIFICATION_CATEGORIES = ['SECURITY', 'TRANSACTIONS', 'ACCOUNT', 'SUPPORT', 'MARKETING'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const KYC_LIMITS: Record<number, { dailyUsd: number; singleUsd: number; label: string }> = {
  0: { dailyUsd: 0, singleUsd: 0, label: 'Unverified — receive only' },
  1: { dailyUsd: 500, singleUsd: 500, label: 'Basic' },
  2: { dailyUsd: 10000, singleUsd: 5000, label: 'Verified' },
  3: { dailyUsd: 50000, singleUsd: 25000, label: 'Premium' },
};

export const ERROR_CODES = {
  VALIDATION: 'VALIDATION',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_BLOCKED: 'ACCOUNT_BLOCKED',
  TWO_FACTOR_REQUIRED: 'TWO_FACTOR_REQUIRED',
  INVALID_2FA: 'INVALID_2FA',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  KYC_REQUIRED: 'KYC_REQUIRED',
  INVALID_PIN: 'INVALID_PIN',
  PIN_NOT_SET: 'PIN_NOT_SET',
  PIN_LOCKED: 'PIN_LOCKED',
  ACCOUNT_FROZEN: 'ACCOUNT_FROZEN',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  MAINTENANCE: 'MAINTENANCE',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = keyof typeof ERROR_CODES;
