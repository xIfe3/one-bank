import { Check } from 'lucide-react';
import { CtaBand, FeatureGrid, PageHero } from './marketing';

export interface ProductContent {
  eyebrow: string;
  title: React.ReactNode;
  body: string;
  visual: React.ReactNode;
  features: { icon: React.ReactNode; title: string; body: string }[];
  highlights?: { title: string; points: string[] };
  faqs?: [string, string][];
  extra?: React.ReactNode;
}

export function ProductPage(c: ProductContent) {
  return (
    <>
      <PageHero eyebrow={c.eyebrow} title={c.title} body={c.body}>
        {c.visual}
      </PageHero>
      <section className="container-x py-20">
        <FeatureGrid items={c.features} />
      </section>
      {c.extra}
      {c.highlights && (
        <section className="bg-white py-20">
          <div className="container-x grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.4fr]">
            <h2 className="h-section text-navy-800">{c.highlights.title}</h2>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {c.highlights.points.map((p) => (
                <li key={p} className="flex gap-3 rounded-2xl border border-navy-100 bg-ivory p-5 text-sm text-navy-700">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold-sheen text-navy-900">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      {c.faqs && (
        <section className="container-x py-20">
          <h2 className="h-section text-navy-800">Questions, answered</h2>
          <div className="mt-8 divide-y divide-navy-100 rounded-3xl border border-navy-100 bg-white">
            {c.faqs.map(([q, a]) => (
              <details key={q} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-navy-800">
                  {q}
                  <span className="text-gold-600 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-navy-500">{a}</p>
              </details>
            ))}
          </div>
        </section>
      )}
      <CtaBand />
    </>
  );
}

export function MiniDashboard({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="w-full max-w-md rounded-3xl border border-navy-100 bg-white p-6 shadow-lift">
      {rows.map(([label, value, sub]) => (
        <div key={label} className="flex items-center justify-between border-b border-navy-50 py-4 last:border-0">
          <div>
            <p className="text-sm font-semibold text-navy-800">{label}</p>
            <p className="text-xs text-navy-400">{sub}</p>
          </div>
          <p className="font-sans tabular-nums tracking-tight text-lg font-semibold text-navy-800">{value}</p>
        </div>
      ))}
    </div>
  );
}
