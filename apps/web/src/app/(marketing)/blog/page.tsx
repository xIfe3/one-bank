import type { Metadata } from 'next';
import Link from 'next/link';
import { POSTS } from '@/lib/content';

export const metadata: Metadata = { title: 'Blog' };

export default function Blog() {
  const [feature, ...rest] = POSTS;
  return (
    <section className="container-x pb-24 pt-36">
      <p className="eyebrow">The One Bank blog</p>
      <h1 className="h-display mt-4 text-navy-800">Money, made clearer.</h1>
      <Link href={`/blog/${feature.slug}`} className="mt-12 grid grid-cols-1 overflow-hidden rounded-[32px] bg-navy-deep text-white transition hover:shadow-lift lg:grid-cols-2">
        <div className="p-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold-400">{feature.category}</p>
          <h2 className="mt-3 font-display text-3xl">{feature.title}</h2>
          <p className="mt-4 text-navy-200">{feature.excerpt}</p>
          <p className="mt-6 text-sm text-navy-300">
            {feature.author} · {new Date(feature.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · {feature.readMins} min read
          </p>
        </div>
        <div className="hidden bg-[radial-gradient(circle_at_30%_30%,#E3C55A_0%,#C9A227_30%,transparent_60%)] opacity-60 lg:block" />
      </Link>
      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        {rest.map((p) => (
          <Link key={p.slug} href={`/blog/${p.slug}`} className="rounded-3xl border border-navy-100 bg-white p-8 transition hover:-translate-y-1 hover:shadow-card">
            <p className="text-xs font-semibold uppercase tracking-widest text-gold-600">{p.category}</p>
            <h2 className="mt-3 font-serif text-2xl text-navy-800">{p.title}</h2>
            <p className="mt-3 text-navy-500">{p.excerpt}</p>
            <p className="mt-5 text-sm text-navy-400">
              {p.author} · {p.readMins} min read
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
