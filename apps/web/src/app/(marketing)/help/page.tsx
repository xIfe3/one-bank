'use client';

import { Button, Input, Skeleton } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';

interface Faq {
  id: string;
  category: string;
  question: string;
  answer: string;
}

export default function Help() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['faqs'], queryFn: () => api.get<Faq[]>('/public/faqs') });
  const filtered = useMemo(() => (data ?? []).filter((f) => !q || (f.question + f.answer).toLowerCase().includes(q.toLowerCase())), [data, q]);
  const groups = useMemo(() => {
    const m = new Map<string, Faq[]>();
    filtered.forEach((f) => m.set(f.category, [...(m.get(f.category) ?? []), f]));
    return [...m.entries()];
  }, [filtered]);
  return (
    <>
      <section className="bg-navy-deep pb-16 pt-36 text-white">
        <div className="container-x max-w-3xl text-center">
          <p className="eyebrow text-gold-400">Help centre</p>
          <h1 className="h-display mt-4">How can we help?</h1>
          <div className="relative mx-auto mt-8 max-w-xl">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-navy-300" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for answers…" className="h-14 rounded-full pl-12 text-base" aria-label="Search help" />
          </div>
        </div>
      </section>
      <section className="container-x py-16">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : groups.length ? (
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            {groups.map(([cat, items]) => (
              <div key={cat}>
                <h2 className="font-serif text-2xl text-navy-800">{cat}</h2>
                <div className="mt-4 divide-y divide-navy-100 rounded-3xl border border-navy-100 bg-white">
                  {items.map((f) => (
                    <details key={f.id} className="group px-6 py-4">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-navy-800">
                        {f.question}
                        <span className="text-gold-600 transition group-open:rotate-45">+</span>
                      </summary>
                      <p className="mt-3 text-sm leading-6 text-navy-500">{f.answer}</p>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-navy-500">No results for “{q}”. Try another search or contact us.</p>
        )}
        <div className="mt-16 flex flex-col items-center justify-between gap-4 rounded-3xl border border-gold-200 bg-gold-50 p-8 sm:flex-row">
          <div>
            <p className="font-serif text-xl text-navy-800">Still need help?</p>
            <p className="text-sm text-navy-500">Members can open a support ticket in the app for a reply within hours.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/app/support">
              <Button variant="primary" icon={<MessageCircle className="h-4 w-4" />}>
                Open a ticket
              </Button>
            </Link>
            <Link href="/contact">
              <Button variant="outline">Contact us</Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
