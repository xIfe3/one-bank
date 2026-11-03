import Decimal from 'decimal.js';

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'NGN'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_META: Record<Currency, { symbol: string; name: string; flag: string; locale: string }> = {
  USD: { symbol: '$', name: 'US Dollar', flag: '🇺🇸', locale: 'en-US' },
  EUR: { symbol: '€', name: 'Euro', flag: '🇪🇺', locale: 'de-DE' },
  GBP: { symbol: '£', name: 'British Pound', flag: '🇬🇧', locale: 'en-GB' },
  NGN: { symbol: '₦', name: 'Nigerian Naira', flag: '🇳🇬', locale: 'en-NG' },
};

export type MoneyInput = Decimal.Value;

/** Round to 2dp using banker-safe ROUND_HALF_UP (bank customer-facing rounding). */
export function toMoney(v: MoneyInput): Decimal {
  return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function formatMoney(amount: MoneyInput, currency: Currency | string, opts: { sign?: boolean } = {}): string {
  const d = new Decimal(amount);
  const meta = CURRENCY_META[currency as Currency];
  const abs = d.abs().toFixed(2);
  const [int, frac] = abs.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = d.isNegative() ? '-' : opts.sign && d.isPositive() && !d.isZero() ? '+' : '';
  return `${sign}${meta?.symbol ?? currency + ' '}${grouped}.${frac}`;
}

/**
 * Fee calculation: flat + percent of amount, bounded by min/max (max 0 = no cap).
 */
export interface FeeRule {
  flat: number;
  percent: number;
  min: number;
  max: number;
}

export function calculateFee(amount: MoneyInput, rule: FeeRule): Decimal {
  const a = new Decimal(amount);
  let fee = new Decimal(rule.flat).plus(a.mul(rule.percent).div(100));
  if (fee.lt(rule.min)) fee = new Decimal(rule.min);
  if (rule.max > 0 && fee.gt(rule.max)) fee = new Decimal(rule.max);
  return toMoney(fee);
}

/**
 * Convert using a mid rate and a spread (percent). The customer always receives the
 * worse side of the spread: rate * (1 - spread/100).
 */
export function convert(amount: MoneyInput, midRate: MoneyInput, spreadPercent: MoneyInput): { rate: Decimal; converted: Decimal } {
  const rate = new Decimal(midRate).mul(new Decimal(1).minus(new Decimal(spreadPercent).div(100))).toDecimalPlaces(8);
  return { rate, converted: toMoney(new Decimal(amount).mul(rate)) };
}

export function maskAccount(acct: string): string {
  return acct.length <= 4 ? acct : `••••${acct.slice(-4)}`;
}
