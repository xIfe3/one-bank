import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LEGAL } from '@/lib/content';

export function generateStaticParams() {
  return Object.keys(LEGAL).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const d = LEGAL[(await params).doc];
  return d ? { title: d.title } : {};
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = LEGAL[doc];
  if (!d) notFound();
  return (
    <section className="container-x grid grid-cols-1 gap-12 pb-24 pt-36 lg:grid-cols-[220px_1fr]">
      <aside className="space-y-1 lg:sticky lg:top-28 lg:self-start">
        <p className="eyebrow mb-3">Legal</p>
        {Object.entries(LEGAL).map(([k, v]) => (
          <Link key={k} href={`/legal/${k}`} className={`block rounded-xl px-3 py-2 text-sm ${k === doc ? 'bg-navy-800 font-semibold text-white' : 'text-navy-600 hover:bg-navy-50'}`}>
            {v.title}
          </Link>
        ))}
      </aside>
      <article className="prose-legal max-w-3xl rounded-3xl border border-navy-100 bg-white p-8 sm:p-12">
        <h1 className="font-display text-4xl text-navy-800">{d.title}</h1>
        <p className="mt-2 text-sm text-navy-400">Last updated {d.updated}</p>
        {d.sections.map((s) => (
          <div key={s.h}>
            <h2>{s.h}</h2>
            {s.p.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        ))}
      </article>
    </section>
  );
}
