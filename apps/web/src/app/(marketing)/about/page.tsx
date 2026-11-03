import { Gem, HeartHandshake, Scale, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { CtaBand, FeatureGrid } from '@/components/marketing';

export const metadata: Metadata = { title: 'About us' };

export default function About() {
  return (
    <>
      <section className="bg-navy-deep pb-24 pt-40 text-white">
        <div className="container-x max-w-4xl">
          <p className="eyebrow text-gold-400">About One Bank</p>
          <h1 className="h-display mt-4">We believe everyone deserves the service of a private bank.</h1>
          <p className="mt-6 text-lg leading-8 text-navy-200">
            For generations, the best banking — attentive service, global reach, smart products — was reserved for the wealthy. One Bank was founded to change that: to combine the polish and discretion of private banking with the speed and fairness of modern technology.
          </p>
        </div>
      </section>
      <section className="container-x grid grid-cols-1 gap-10 py-20 lg:grid-cols-4">
        {[
          ['2024', 'Founded in New York'],
          ['3', 'major currencies'],
          ['180+', 'countries reachable by wire'],
          ['4h', 'typical support response'],
        ].map(([k, v]) => (
          <div key={v} className="border-l-2 border-gold-500 pl-5">
            <p className="font-sans tabular-nums tracking-tight text-4xl font-semibold text-navy-800">{k}</p>
            <p className="mt-1 text-sm text-navy-500">{v}</p>
          </div>
        ))}
      </section>
      <section className="bg-white py-20">
        <div className="container-x">
          <h2 className="h-section text-navy-800">Our values</h2>
          <div className="mt-10">
            <FeatureGrid
              items={[
                { icon: <ShieldCheck className="h-5 w-5" />, title: 'Security without compromise', body: 'Every feature starts with protecting our members and their money.' },
                { icon: <Scale className="h-5 w-5" />, title: 'Radical transparency', body: 'Fees, rates and limits are always visible before you commit.' },
                { icon: <HeartHandshake className="h-5 w-5" />, title: 'Human service', body: 'Real people, real answers — backed by great tools.' },
                { icon: <Gem className="h-5 w-5" />, title: 'Craft and quality', body: 'We sweat the details so banking feels effortless.' },
              ]}
            />
          </div>
        </div>
      </section>
      <section className="container-x py-20">
        <h2 className="h-section text-navy-800">Leadership</h2>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Olivia Grant', 'Chief Executive Officer'],
            ['Daniel Reyes', 'Chief Operating Officer'],
            ['Priya Shah', 'Head of Customer Experience'],
            ['Marcus Lee', 'Chief Compliance Officer'],
          ].map(([n, r]) => (
            <div key={n} className="rounded-3xl border border-navy-100 bg-white p-6">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-navy-800 font-serif text-xl text-gold-300">
                {n
                  .split(' ')
                  .map((p) => p[0])
                  .join('')}
              </div>
              <p className="mt-4 font-serif text-lg text-navy-800">{n}</p>
              <p className="text-sm text-navy-400">{r}</p>
            </div>
          ))}
        </div>
      </section>
      <CtaBand />
    </>
  );
}
