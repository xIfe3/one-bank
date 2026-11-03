import { describe, expect, it } from 'vitest';
import { calculateFee, convert, formatMoney, toMoney } from './money';

describe('money', () => {
  it('rounds half up to 2dp', () => {
    expect(toMoney('1.005').toFixed(2)).toBe('1.01');
    expect(toMoney('2.004').toFixed(2)).toBe('2.00');
  });

  it('formats with grouping and symbols', () => {
    expect(formatMoney('1234567.5', 'USD')).toBe('$1,234,567.50');
    expect(formatMoney('-20', 'GBP')).toBe('-£20.00');
    expect(formatMoney('20', 'NGN', { sign: true })).toBe('+₦20.00');
  });

  it('calculates fees with min and max bounds', () => {
    const rule = { flat: 0, percent: 1, min: 25, max: 100 };
    expect(calculateFee(1000, rule).toFixed(2)).toBe('25.00');
    expect(calculateFee(5000, rule).toFixed(2)).toBe('50.00');
    expect(calculateFee(50000, rule).toFixed(2)).toBe('100.00');
    expect(calculateFee(100, { flat: 1.5, percent: 0, min: 0, max: 0 }).toFixed(2)).toBe('1.50');
  });

  it('applies spread against the customer', () => {
    const { rate, converted } = convert(100, '0.9', '1');
    expect(rate.toString()).toBe('0.891');
    expect(converted.toFixed(2)).toBe('89.10');
  });
});
