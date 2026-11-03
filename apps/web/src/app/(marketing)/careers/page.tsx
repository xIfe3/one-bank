import { Button } from '@onebank/ui';
import { ArrowRight, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Careers' };

const ROLES = [
  ['Senior Backend Engineer, Ledger', 'Engineering', 'New York · Hybrid'],
  ['Product Designer, Mobile', 'Design', 'London · Hybrid'],
  ['Compliance Analyst (AML)', 'Compliance', 'Lagos · On-site'],
  ['Customer Success Specialist', 'Operations', 'Remote'],
  ['Data Engineer', 'Engineering', 'Remote'],
  ['Head of Partnerships, Africa', 'Business', 'Lagos · Hybrid'],
];

export default function Careers() {
  return (
    <>
      <section className="bg-white pb-16 pt-36">
        <div className="container-x max-w-3xl">
          <p className="eyebrow">Careers</p>
          <h1 className="h-display mt-4 text-navy-800">Build the bank you wish you had.</h1>
          <p className="mt-5 text-lg text-navy-500">We are a small, senior team across New York, London and Lagos. We value craft, ownership and kindness — and we offer competitive pay, equity, flexible work and a generous learning budget.</p>
        </div>
      </section>
      <section className="container-x py-16">
        <h2 className="font-serif text-2xl text-navy-800">Open roles</h2>
        <div className="mt-6 divide-y divide-navy-100 rounded-3xl border border-navy-100 bg-white">
          {ROLES.map(([t, team, loc]) => (
            <div key={t} className="flex flex-col justify-between gap-3 px-6 py-5 sm:flex-row sm:items-center">
              <div>
                <p className="font-semibold text-navy-800">{t}</p>
                <p className="mt-1 flex items-center gap-3 text-sm text-navy-400">
                  <span>{team}</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {loc}
                  </span>
                </p>
              </div>
              <Link href={`/contact?topic=careers&role=${encodeURIComponent(t)}`}>
                <Button variant="outline" size="sm">
                  Apply <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
