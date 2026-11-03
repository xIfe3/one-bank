import { z } from 'zod';
import { CURRENCIES } from './money';
import { BILL_CATEGORIES, TICKET_CATEGORIES, TICKET_PRIORITIES } from './enums';

const money = z.coerce
  .number({ invalid_type_error: 'Enter an amount' })
  .positive('Amount must be greater than 0')
  .max(10_000_000, 'Amount too large')
  .refine((n) => Math.round(n * 100) === n * 100 || Number(n.toFixed(2)) === n, 'Max 2 decimal places');

export const passwordSchema = z
  .string()
  .min(10, 'At least 10 characters')
  .max(128)
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/[0-9]/, 'Include a number');

export const pinSchema = z.string().regex(/^\d{4}$/, 'PIN must be 4 digits');
export const currencySchema = z.enum(CURRENCIES);

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(7).max(20),
  country: z.string().trim().length(2),
  dateOfBirth: z.coerce.date().refine((d) => {
    const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    return age >= 18 && age < 120;
  }, 'You must be at least 18'),
  addressLine1: z.string().trim().min(3).max(120),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().max(60).optional().default(''),
  postalCode: z.string().trim().max(20).optional().default(''),
  baseCurrency: currencySchema,
  referralCode: z.string().trim().max(20).optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms' }) }),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional().default(true),
});

export const twoFactorLoginSchema = z.object({
  challengeToken: z.string().min(10),
  code: z.string().trim().min(6).max(12),
});

export const forgotPasswordSchema = z.object({ email: z.string().trim().toLowerCase().email() });
export const resetPasswordSchema = z.object({ token: z.string().min(20), password: passwordSchema });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });
export const changeEmailSchema = z.object({ newEmail: z.string().trim().toLowerCase().email(), password: z.string().min(1) });
export const setPinSchema = z.object({ pin: pinSchema, password: z.string().min(1) });
export const resetPinSchema = z.object({ token: z.string().min(6), pin: pinSchema });

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(7).max(20),
  addressLine1: z.string().trim().min(3).max(120),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().max(60).optional().default(''),
  postalCode: z.string().trim().max(20).optional().default(''),
  tag: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/, '3–20 letters, numbers or _')
    .optional(),
});

const moneyAction = { pin: pinSchema, otp: z.string().trim().optional(), idempotencyKey: z.string().min(8).max(64) };

export const depositSchema = z.object({ accountId: z.string(), amount: money, method: z.enum(['CARD', 'BANK']), ...moneyAction });

export const internalTransferSchema = z.object({
  fromAccountId: z.string(),
  recipient: z.string().trim().min(3).max(30), // account number or @tag
  amount: money,
  narration: z.string().trim().max(140).optional().default(''),
  saveBeneficiary: z.boolean().optional().default(false),
  scheduledFor: z.coerce.date().optional(),
  frequency: z.enum(['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY']).optional().default('ONCE'),
  ...moneyAction,
});

export const interbankTransferSchema = z.object({
  fromAccountId: z.string(),
  bankCode: z.string().min(2),
  accountNumber: z.string().regex(/^\d{6,12}$/, 'Enter a valid account number'),
  accountName: z.string().min(2),
  amount: money,
  narration: z.string().trim().max(140).optional().default(''),
  saveBeneficiary: z.boolean().optional().default(false),
  scheduledFor: z.coerce.date().optional(),
  frequency: z.enum(['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY']).optional().default('ONCE'),
  ...moneyAction,
});

export const wireTransferSchema = z.object({
  fromAccountId: z.string(),
  beneficiaryName: z.string().trim().min(2).max(100),
  beneficiaryAddress: z.string().trim().min(5).max(200),
  country: z.string().length(2),
  bankName: z.string().trim().min(2).max(100),
  swiftCode: z.string().trim().toUpperCase().regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, 'Invalid SWIFT/BIC'),
  iban: z.string().trim().toUpperCase().min(8).max(34),
  purpose: z.string().trim().min(3).max(140),
  amount: money,
  saveBeneficiary: z.boolean().optional().default(false),
  ...moneyAction,
});

export const fxQuoteSchema = z.object({ from: currencySchema, to: currencySchema, amount: money });
export const fxExchangeSchema = z.object({
  fromAccountId: z.string(),
  toAccountId: z.string(),
  amount: money,
  quoteId: z.string(),
  ...moneyAction,
});

export const billValidateSchema = z.object({ providerId: z.string(), customerId: z.string().trim().min(4).max(30) });
export const billPaySchema = z.object({
  fromAccountId: z.string(),
  providerId: z.string(),
  category: z.enum(BILL_CATEGORIES),
  customerId: z.string().trim().min(4).max(30),
  amount: money,
  ...moneyAction,
});

export const createCardSchema = z.object({
  fundingAccountId: z.string(),
  brand: z.enum(['VISA', 'MASTERCARD']),
  label: z.string().trim().max(40).optional().default('Virtual card'),
  initialFunding: z.coerce.number().min(0).optional().default(0),
  ...moneyAction,
});
export const cardFundSchema = z.object({ accountId: z.string(), amount: money, ...moneyAction });
export const cardLimitSchema = z.object({ spendLimit: z.coerce.number().min(0) });
export const simulatePurchaseSchema = z.object({ merchant: z.string().min(2).max(60), amount: money, category: z.string().max(30).optional().default('Shopping') });

export const openWalletSchema = z.object({ currency: currencySchema });

export const savingsGoalSchema = z.object({
  name: z.string().trim().min(2).max(60),
  currency: currencySchema,
  targetAmount: money,
  targetDate: z.coerce.date().optional(),
  autoSaveAmount: z.coerce.number().min(0).optional().default(0),
  autoSaveFrequency: z.enum(['NONE', 'WEEKLY', 'MONTHLY']).optional().default('NONE'),
  autoSaveSourceId: z.string().optional(),
});
export const savingsMoveSchema = z.object({ accountId: z.string(), amount: money, ...moneyAction });

export const fixedDepositSchema = z.object({
  fromAccountId: z.string(),
  amount: money,
  tenorDays: z.coerce.number().refine((n) => [30, 90, 180, 365].includes(n), 'Invalid tenor'),
  ...moneyAction,
});

export const loanApplySchema = z.object({
  productId: z.string(),
  accountId: z.string(),
  amount: money,
  tenorMonths: z.coerce.number().int().min(1).max(36),
  purpose: z.string().trim().min(3).max(200),
});
export const loanRepaySchema = z.object({ accountId: z.string(), amount: money, ...moneyAction });

export const beneficiarySchema = z.object({
  type: z.enum(['INTERNAL', 'INTERBANK', 'WIRE']),
  nickname: z.string().trim().max(40).optional(),
  name: z.string().trim().min(2).max(100),
  accountNumber: z.string().trim().min(4).max(34),
  bankCode: z.string().optional(),
  bankName: z.string().optional(),
  swiftCode: z.string().optional(),
  country: z.string().optional(),
  address: z.string().optional(),
});

export const ticketCreateSchema = z.object({
  subject: z.string().trim().min(4).max(140),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES).optional().default('MEDIUM'),
  message: z.string().trim().min(5).max(5000),
  journalEntryId: z.string().optional(),
});
export const ticketReplySchema = z.object({ message: z.string().trim().min(1).max(5000), internal: z.boolean().optional().default(false) });

export const kycSubmitSchema = z.object({
  level: z.coerce.number().int().min(2).max(3),
  idType: z.enum(['PASSPORT', 'DRIVERS_LICENSE', 'NATIONAL_ID', 'UTILITY_BILL', 'BANK_STATEMENT']),
  idNumber: z.string().trim().min(4).max(40),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  subject: z.string().trim().min(2).max(140),
  message: z.string().trim().min(10).max(5000),
});
export const newsletterSchema = z.object({ email: z.string().trim().toLowerCase().email() });

export const statementSchema = z.object({
  accountId: z.string(),
  from: z.coerce.date(),
  to: z.coerce.date(),
  email: z.boolean().optional().default(false),
});

// ---------- Admin ----------
export const adminReasonSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const adminAdjustSchema = z.object({
  accountId: z.string(),
  direction: z.enum(['CREDIT', 'DEBIT']),
  amount: money,
  kind: z.enum(['ADJUSTMENT', 'BONUS', 'REFUND', 'FEE', 'CHARGEBACK']),
  description: z.string().trim().min(3).max(200),
  reason: z.string().trim().min(3).max(500),
  valueDate: z.coerce.date().optional(),
  notifyUser: z.boolean().optional().default(true),
});
export const adminCustomTransactionSchema = z.object({
  accountId: z.string(),
  direction: z.enum(['CREDIT', 'DEBIT']),
  type: z.enum(['DEPOSIT', 'INTERNAL_TRANSFER', 'INTERBANK', 'WIRE', 'BILL', 'CARD_SPEND', 'FEE', 'INTEREST', 'ADMIN_CREDIT', 'ADMIN_DEBIT']),
  amount: money,
  counterpartyName: z.string().trim().min(2).max(100),
  counterpartyAccount: z.string().trim().max(40).optional().default(''),
  counterpartyBank: z.string().trim().max(100).optional().default(''),
  description: z.string().trim().min(3).max(200),
  reference: z.string().trim().max(40).optional(),
  valueDate: z.coerce.date().optional(),
  status: z.enum(['COMPLETED', 'PENDING']).optional().default('COMPLETED'),
  reason: z.string().trim().min(3).max(500),
  notifyUser: z.boolean().optional().default(false),
});
export const adminNotifySchema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(5000),
  channels: z.array(z.enum(['IN_APP', 'EMAIL'])).min(1),
  link: z.string().optional(),
});
export const adminBroadcastSchema = adminNotifySchema.extend({
  segment: z.object({
    status: z.string().optional(),
    kycLevel: z.coerce.number().optional(),
    country: z.string().optional(),
    currency: z.string().optional(),
  }),
});
export const adminSettingsSchema = z.object({
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(500).optional(),
  maintenanceEta: z.string().nullable().optional(),
  features: z.record(z.boolean()).optional(),
  fees: z.record(z.object({ flat: z.number(), percent: z.number(), min: z.number(), max: z.number() })).optional(),
  reviewThresholdUsd: z.number().min(0).optional(),
  otpThresholdUsd: z.number().min(0).optional(),
  depositDailyCapUsd: z.number().min(0).optional(),
  savingsRate: z.number().min(0).max(100).optional(),
  fixedDepositRates: z.record(z.number()).optional(),
  referralBonusUsd: z.number().min(0).optional(),
  fixedDepositPenaltyPercent: z.number().min(0).max(100).optional(),
  lowBalanceUsd: z.number().min(0).optional(),
  kycLimits: z.record(z.object({ dailyUsd: z.number(), singleUsd: z.number(), label: z.string() })).optional(),
});
export const adminInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  role: z.enum(['SUPERADMIN', 'ADMIN', 'SUPPORT', 'COMPLIANCE']),
});
export const announcementSchema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(1000),
  variant: z.enum(['INFO', 'SUCCESS', 'WARNING', 'PROMO']),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional().nullable(),
  active: z.boolean().optional().default(true),
});
