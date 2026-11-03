'use client';

import { formatMoney } from '@onebank/shared';
import { useMemo, useState } from 'react';

/** Amortised instalment preview (mirrors the API's schedule maths). */
export function LoanCalculator() {
  const [amount, setAmount] = useState(5000);
  const [months, setMonths] = useState(12);
  const rate = 11.9;
  const { instalment, total } = useMemo(() => {
    const r = rate / 100 / 12;
    const i = (amount * r) / (1 - Math.pow(1 + r, -months));
    return { instalment: i, total: i * months };
  }, [amount, months]);
  return (
    <div className="w-full max-w-md rounded-3xl border border-navy-100 bg-white p-6 shadow-lift">
      <p className="eyebrow">Loan calculator</p>
      <label className="mt-5 block text-sm font-medium text-navy-700">
        Amount <span className="float-right font-sans tabular-nums tracking-tight font-semibold text-lg text-navy-800">{formatMoney(amount, 'USD')}</span>
      </label>
      <input type="range" min={500} max={25000} step={250} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="mt-2 w-full accent-[#C9A227]" />
      <label className="mt-5 block text-sm font-medium text-navy-700">
        Term <span className="float-right font-serif text-lg text-navy-800">{months} months</span>
      </label>
      <input type="range" min={3} max={36} value={months} onChange={(e) => setMonths(Number(e.target.value))} className="mt-2 w-full accent-[#C9A227]" />
      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-navy-deep p-4 text-white">
          <p className="text-xs text-gold-300">Monthly</p>
          <p className="font-sans tabular-nums tracking-tight text-2xl font-semibold">{formatMoney(instalment.toFixed(2), 'USD')}</p>
        </div>
        <div className="rounded-2xl bg-ivory p-4">
          <p className="text-xs text-navy-400">Total repayable</p>
          <p className="font-sans tabular-nums tracking-tight text-2xl font-semibold text-navy-800">{formatMoney(total.toFixed(2), 'USD')}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-navy-400">Representative example at {rate}% p.a. fixed (Personal Loan). Subject to approval.</p>
    </div>
  );
}
