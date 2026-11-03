import { Button } from '@onebank/ui';
import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CtaBand } from '@/components/marketing';

export const metadata: Metadata = { title: 'Pricing & fees', description: 'Simple, transparent One Bank pricing. No monthly fees.' };

const FEES: [string, string][] = [
  ['Account opening & maintenance', 'Free'],
  ['Transfers to One Bank members', 'Free, instant'],
  ['Domestic bank transfers', '$1.50 flat'],
  ['International wires (SWIFT)', '0.5% · min $15 · max $150'],
  ['Currency exchange', 'Mid-market + 0.75%'],
  ['Virtual card issuance', '$5 one-time'],
  ['Card top-up & withdrawal', 'Free'],
  ['Bill payments & airtime', 'Free'],
  ['Account statements (PDF/CSV)', 'Free'],
  ['Fixed deposit early withdrawal', '1% of principal (capped at interest earned)'],
  ['Late loan repayment', '2% of the missed instalment'],
];

const TIERS = [
  { name: 'Basic', level: 'Level 1', limit: '$500 / day', points: ['Email & phone verified', 'Domestic transfers', 'Virtual cards', 'Savings goals'] },
  { name: 'Verified', level: 'Level 2', limit: '$10,000 / day', points: ['Government ID + selfie', 'International wires', 'Loans', 'Everything in Basic'], featured: true },
  { name: 'Premium', level: 'Level 3', limit: '$50,000 / day', points: ['Proof of address', 'Highest limits', 'Priority support', 'Everything in Verified'] },
];

export default function Pricing() {
  return (
    <>
      <section className="bg-white pb-16 pt-36">
        <div className="container-x text-center">
          <p className="eyebrow">Pricing</p>
          <h1 className="h-display mt-4 text-navy-800">Simple pricing. No surprises.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-navy-500">One Bank is free to open and free to keep. You only pay for a few specific services, and we always show the fee before you confirm.</p>
        </div>
      </section>
      <section className="container-x py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {TIERS.map((t) => (
            <div key={t.name} className={t.featured ? 'rounded-3xl bg-navy-deep p-8 text-white shadow-lift' : 'rounded-3xl border border-navy-100 bg-white p-8'}>
              <p className={t.featured ? 'eyebrow text-gold-300' : 'eyebrow'}>{t.level}</p>
              <h3 className="mt-2 font-serif text-2xl">{t.name}</h3>
              <p className="mt-4 font-sans tabular-nums tracking-tight text-4xl font-semibold">{t.limit}</p>
              <p className={t.featured ? 'text-sm text-navy-300' : 'text-sm text-navy-400'}>sending limit · always free</p>
              <ul className="mt-6 space-y-3 text-sm">
                {t.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <Check className="h-4 w-4 text-gold-500" /> {p}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="mt-8 block">
                <Button variant={t.featured ? 'gold' : 'outline'} block>
                  Get started
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </section>
      <section className="container-x pb-10">
        <h2 className="h-section text-navy-800">Fee schedule</h2>
        <div className="mt-8 overflow-hidden rounded-3xl border border-navy-100 bg-white">
          {FEES.map(([k, v], i) => (
            <div key={k} className={`flex flex-col justify-between gap-1 px-6 py-4 sm:flex-row ${i % 2 ? 'bg-ivory/60' : ''}`}>
              <span className="text-navy-700">{k}</span>
              <span className="font-semibold text-navy-800">{v}</span>
            </div>
          ))}
        </div>
      </section>
      <CtaBand />
    </>
  );
}
