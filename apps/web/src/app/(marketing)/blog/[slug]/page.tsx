import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CtaBand } from '@/components/marketing';
import { POSTS } from '@/lib/content';

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = POSTS.find((p) => p.slug === slug);
  return post ? { title: post.title, description: post.excerpt } : {};
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) notFound();
  return (
    <>
      <article className="container-x max-w-3xl pb-10 pt-36">
        <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-semibold text-navy-500 hover:text-navy-800">
          <ArrowLeft className="h-4 w-4" /> All articles
        </Link>
        <p className="eyebrow mt-8">{post.category}</p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-navy-800 sm:text-5xl">{post.title}</h1>
        <p className="mt-4 text-sm text-navy-400">
          {post.author} · {new Date(post.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · {post.readMins} min read
        </p>
        <div className="prose-legal mt-10">
          {post.body.map((b, i) => (
            <div key={i}>
              {b.h && <h2>{b.h}</h2>}
              <p>{b.p}</p>
            </div>
          ))}
        </div>
      </article>
      <CtaBand />
    </>
  );
}
