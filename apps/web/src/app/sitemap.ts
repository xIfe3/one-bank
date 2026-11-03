import type { MetadataRoute } from 'next';
import { LEGAL, POSTS } from '@/lib/content';

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100';

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ['', 'personal', 'business', 'cards', 'savings', 'loans', 'international', 'pricing', 'about', 'careers', 'press', 'security', 'help', 'contact', 'blog', 'status', 'signup', 'login'];
  return [
    ...pages.map((p) => ({ url: `${BASE}/${p}`, changeFrequency: 'weekly' as const, priority: p === '' ? 1 : 0.7 })),
    ...POSTS.map((p) => ({ url: `${BASE}/blog/${p.slug}`, lastModified: p.date })),
    ...Object.keys(LEGAL).map((d) => ({ url: `${BASE}/legal/${d}`, priority: 0.3 })),
  ];
}
