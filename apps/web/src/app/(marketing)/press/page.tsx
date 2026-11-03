import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Press' };

const NEWS = [
  ['October 2026', 'One Bank launches 10% p.a. fixed deposits for 12-month terms'],
  ['August 2026', 'One Bank launches instant bill payments and airtime top-ups'],
  ['May 2026', 'One Bank introduces PIN-protected virtual cards with spend limits'],
  ['January 2026', 'One Bank opens to the public with USD, EUR and GBP accounts'],
];

export default function Press() {
  return (
    <section className="container-x pb-24 pt-36">
      <p className="eyebrow">Press</p>
      <h1 className="h-display mt-4 text-navy-800">News & media</h1>
      <p className="mt-5 max-w-2xl text-lg text-navy-500">
        For interviews and media enquiries, email <span className="font-semibold text-navy-800">press@onebank.test</span> or use our{' '}
        <Link href="/contact?topic=press" className="font-semibold text-navy-800 underline">
          contact form
        </Link>
        .
      </p>
      <div className="mt-12 grid gap-5 md:grid-cols-2">
        {NEWS.map(([d, t]) => (
          <article key={t} className="rounded-3xl border border-navy-100 bg-white p-7">
            <p className="text-xs font-semibold uppercase tracking-widest text-gold-600">{d}</p>
            <h2 className="mt-3 font-serif text-xl text-navy-800">{t}</h2>
          </article>
        ))}
      </div>
      <div className="mt-12 rounded-3xl bg-navy-deep p-8 text-white">
        <h2 className="font-serif text-2xl">Brand assets</h2>
        <p className="mt-2 text-navy-200">Our wordmark uses Libre Caslon in white or navy (#0B1B3F) with “Bank” set in gold (#C9A227). Please do not alter the colours or proportions.</p>
      </div>
    </section>
  );
}
