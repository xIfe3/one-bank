import { Injectable } from '@nestjs/common';
import { FEATURE_FLAGS, KYC_LIMITS, type FeatureFlag, type FeeRule } from '@onebank/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../common/infra';

export interface PlatformSettings {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  maintenanceEta: string | null;
  features: Record<FeatureFlag, boolean>;
  /** Fee rules expressed in USD; converted to the account currency at charge time. */
  fees: { interbank: FeeRule; wire: FeeRule; cardIssue: FeeRule; bill: FeeRule; fx: FeeRule };
  reviewThresholdUsd: number;
  otpThresholdUsd: number;
  depositDailyCapUsd: number;
  savingsRate: number;
  fixedDepositRates: Record<string, number>;
  fixedDepositPenaltyPercent: number;
  referralBonusUsd: number;
  lowBalanceUsd: number;
  kycLimits: Record<string, { dailyUsd: number; singleUsd: number; label: string }>;
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  maintenanceMode: false,
  maintenanceMessage: 'We are performing scheduled maintenance to improve your experience. We will be back shortly.',
  maintenanceEta: null,
  features: Object.fromEntries(FEATURE_FLAGS.map((f) => [f, true])) as Record<FeatureFlag, boolean>,
  fees: {
    interbank: { flat: 1.5, percent: 0, min: 0, max: 0 },
    wire: { flat: 0, percent: 0.5, min: 15, max: 150 },
    cardIssue: { flat: 5, percent: 0, min: 0, max: 0 },
    bill: { flat: 0, percent: 0, min: 0, max: 0 },
    fx: { flat: 0, percent: 0, min: 0, max: 0 },
  },
  reviewThresholdUsd: 5000,
  otpThresholdUsd: 1000,
  depositDailyCapUsd: 5000,
  savingsRate: 4.5,
  fixedDepositRates: { '30': 5, '90': 6.5, '180': 8, '365': 10 },
  fixedDepositPenaltyPercent: 1,
  referralBonusUsd: 10,
  lowBalanceUsd: 20,
  kycLimits: Object.fromEntries(Object.entries(KYC_LIMITS).map(([k, v]) => [k, v])),
};

const KEY = 'platform';

@Injectable()
export class SettingsService {
  private cache: { value: PlatformSettings; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<PlatformSettings> {
    if (this.cache && Date.now() - this.cache.at < 5000) return this.cache.value;
    const row = await this.prisma.systemSetting.findUnique({ where: { key: KEY } });
    const stored = (row?.value ?? {}) as Partial<PlatformSettings>;
    const value: PlatformSettings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      features: { ...DEFAULT_SETTINGS.features, ...(stored.features ?? {}) },
      fees: { ...DEFAULT_SETTINGS.fees, ...(stored.fees ?? {}) },
      kycLimits: { ...DEFAULT_SETTINGS.kycLimits, ...(stored.kycLimits ?? {}) },
      fixedDepositRates: { ...DEFAULT_SETTINGS.fixedDepositRates, ...(stored.fixedDepositRates ?? {}) },
    };
    this.cache = { value, at: Date.now() };
    return value;
  }

  async update(patch: Partial<PlatformSettings>, adminId?: string): Promise<{ before: PlatformSettings; after: PlatformSettings }> {
    const before = await this.get();
    const after: PlatformSettings = {
      ...before,
      ...patch,
      features: { ...before.features, ...(patch.features ?? {}) },
      fees: { ...before.fees, ...(patch.fees ?? {}) },
      kycLimits: { ...before.kycLimits, ...(patch.kycLimits ?? {}) },
      fixedDepositRates: { ...before.fixedDepositRates, ...(patch.fixedDepositRates ?? {}) },
    };
    await this.prisma.systemSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: after as object, updatedBy: adminId },
      update: { value: after as object, updatedBy: adminId },
    });
    this.cache = null;
    return { before, after };
  }

  async assertFeature(flag: FeatureFlag) {
    const s = await this.get();
    if (!s.features[flag]) throw new AppError('FEATURE_DISABLED', 'This service is temporarily unavailable. Please try again later.');
  }

  /** Public subset safe to expose to the customer/marketing apps. */
  async publicStatus() {
    const s = await this.get();
    return {
      maintenanceMode: s.maintenanceMode,
      maintenanceMessage: s.maintenanceMessage,
      maintenanceEta: s.maintenanceEta,
      features: s.features,
      fees: s.fees,
      kycLimits: s.kycLimits,
      savingsRate: s.savingsRate,
      fixedDepositRates: s.fixedDepositRates,
      otpThresholdUsd: s.otpThresholdUsd,
      referralBonusUsd: s.referralBonusUsd,
    };
  }
}
