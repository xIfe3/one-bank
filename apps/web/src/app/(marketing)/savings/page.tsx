import { CalendarClock, Lock, PiggyBank, Repeat, Target, TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';
import { ProductPage } from '@/components/product-page';

export const metadata: Metadata = { title: 'Savings & fixed deposits', description: 'Savings goals with auto-save and monthly interest, plus fixed deposits up to 10% p.a.' };

const RATES = [
  ['30 days', '5.0%'],
  ['90 days', '6.5%'],
  ['180 days', '8.0%'],
  ['365 days', '10.0%'],
];

export default function Savings() {
  return (
    <ProductPage
      eyebrow="Savings & deposits"
      title={<>Make your money work as hard as you do.</>}
      body="Set goals, automate your saving and lock in market-leading fixed deposit rates — all from your One Bank app."
      visual={
        <div className="w-full max-w-md rounded-3xl border border-navy-100 bg-white p-6 shadow-lift">
          <p className="eyebrow">Fixed deposit rates</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {RATES.map(([t, r]) => (
              <div key={t} className="rounded-2xl bg-ivory p-4">
                <p className="text-xs text-navy-400">{t}</p>
                <p className="font-sans tabular-nums tracking-tight text-3xl font-semibold text-navy-800">{r}</p>
                <p className="text-xs text-navy-400">per annum</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-2xl bg-navy-deep p-4 text-white">
            <div className="flex justify-between text-sm">
              <span>Japan trip 🎌</span>
              <span className="text-gold-300">$2,507 / $6,000</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/10">
              <div className="h-2 w-[42%] rounded-full bg-gold-sheen" />
            </div>
          </div>
        </div>
      }
      features={[
        { icon: <Target className="h-5 w-5" />, title: 'Savings goals', body: 'Create as many goals as you like, each with its own target and progress tracker.' },
        { icon: <Repeat className="h-5 w-5" />, title: 'Auto-save', body: 'Move a fixed amount every week or month automatically.' },
        { icon: <TrendingUp className="h-5 w-5" />, title: 'Monthly interest', body: 'Earn 4.5% p.a. on savings goals, paid monthly.' },
        { icon: <Lock className="h-5 w-5" />, title: 'Fixed deposits', body: 'Lock funds for 30–365 days and earn up to 10% p.a.' },
        { icon: <CalendarClock className="h-5 w-5" />, title: 'Paid at maturity', body: 'Principal and interest return to your account automatically.' },
        { icon: <PiggyBank className="h-5 w-5" />, title: 'Flexible access', body: 'Need it early? Break a deposit with a small, clearly-stated penalty.' },
      ]}
      faqs={[
        ['What is the minimum fixed deposit?', '$100 or the equivalent in your account currency.'],
        ['What happens if I break a deposit early?', 'You receive your full principal plus interest earned so far, minus a penalty of 1% of the principal (never more than the interest earned).'],
      ]}
    />
  );
}
