'use client';

import { CURRENCY_META, type Currency } from '@onebank/shared';
import { Button, Logo, cn } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronDown, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

/** Currencies promoted on the marketing site. */
const MARKETING_CURRENCIES: Currency[] = ['USD', 'EUR', 'GBP'];

const NAV = [
  {
    label: 'Personal',
    items: [
      { href: '/personal', title: 'Personal accounts', desc: 'Multi-currency accounts with no monthly fees' },
      { href: '/cards', title: 'Virtual cards', desc: 'Instant cards with real-time controls' },
      { href: '/savings', title: 'Savings & deposits', desc: 'Goals, auto-save and fixed deposits up to 10% p.a.' },
      { href: '/loans', title: 'Loans', desc: 'Transparent personal loans, decided fast' },
    ],
  },
  { label: 'Business', href: '/business' },
  { label: 'International', href: '/international' },
  { label: 'Pricing', href: '/pricing' },
  {
    label: 'Company',
    items: [
      { href: '/about', title: 'About us', desc: 'Our story and values' },
      { href: '/security', title: 'Security', desc: 'How we protect you and your money' },
      { href: '/careers', title: 'Careers', desc: 'Build the future of banking with us' },
      { href: '/press', title: 'Press', desc: 'News and media resources' },
      { href: '/blog', title: 'Blog', desc: 'Money guides and product news' },
    ],
  },
  { label: 'Help', href: '/help' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const dark = pathname === '/';
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener('scroll', on);
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => setOpen(false), [pathname]);
  const solid = scrolled || !dark || open;
  return (
    <header className={cn('fixed inset-x-0 top-0 z-40 transition', solid ? 'border-b border-navy-100/60 bg-white/90 backdrop-blur-xl' : 'bg-transparent')}>
      <PromoStrip />
      <div className="container-x flex h-16 items-center justify-between gap-6">
        <Link href="/" aria-label="One Bank home">
          <Logo light={!solid} />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) =>
            n.items ? (
              <div key={n.label} className="group relative">
                <button className={cn('flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-medium transition', solid ? 'text-navy-700 hover:bg-navy-50' : 'text-white/85 hover:text-white')}>
                  {n.label} <ChevronDown className="h-3.5 w-3.5 transition group-hover:rotate-180" />
                </button>
                <div className="invisible absolute left-1/2 top-full w-[380px] -translate-x-1/2 pt-3 opacity-0 transition group-hover:visible group-hover:opacity-100">
                  <div className="rounded-2xl border border-navy-100 bg-white p-2 shadow-lift">
                    {n.items.map((i) => (
                      <Link key={i.href} href={i.href} className="block rounded-xl px-4 py-3 hover:bg-ivory">
                        <p className="text-sm font-semibold text-navy-800">{i.title}</p>
                        <p className="text-xs text-navy-400">{i.desc}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <Link key={n.label} href={n.href!} className={cn('rounded-full px-3.5 py-2 text-sm font-medium transition', solid ? 'text-navy-700 hover:bg-navy-50' : 'text-white/85 hover:text-white')}>
                {n.label}
              </Link>
            ),
          )}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/login" className={cn('rounded-full px-4 py-2 text-sm font-semibold', solid ? 'text-navy-800 hover:bg-navy-50' : 'text-white hover:bg-white/10')}>
            Sign in
          </Link>
          <Link href="/signup">
            <Button variant="gold">Open an account</Button>
          </Link>
        </div>
        <button className={cn('rounded-full p-2 lg:hidden', solid ? 'text-navy-800' : 'text-white')} onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div className="max-h-[80vh] overflow-y-auto border-t border-navy-100 bg-white px-5 pb-6 lg:hidden">
          {NAV.flatMap((n) => (n.items ? n.items.map((i) => ({ href: i.href, label: i.title })) : [{ href: n.href!, label: n.label }])).map((l) => (
            <Link key={l.href} href={l.href} className="block border-b border-navy-50 py-3 text-sm font-medium text-navy-800">
              {l.label}
            </Link>
          ))}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Link href="/login">
              <Button variant="outline" block>
                Sign in
              </Button>
            </Link>
            <Link href="/signup">
              <Button variant="gold" block>
                Open account
              </Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

function PromoStrip() {
  const { data } = useQuery({ queryKey: ['promo'], queryFn: () => api.get<{ id: string; title: string; body: string }[]>('/public/announcements'), staleTime: 300_000 });
  const [hidden, setHidden] = useState(true);
  const promo = data?.[0];
  useEffect(() => setHidden(!promo || localStorage.getItem('ob_promo') === promo.id), [promo]);
  if (!promo || hidden) return null;
  return (
    <div className="bg-navy-900 text-center text-xs text-white">
      <div className="container-x flex items-center justify-center gap-3 py-2">
        <span className="font-semibold text-gold-300">{promo.title}</span>
        <span className="hidden text-navy-200 sm:inline">{promo.body}</span>
        <button
          onClick={() => {
            localStorage.setItem('ob_promo', promo.id);
            setHidden(true);
          }}
          aria-label="Dismiss"
          className="text-navy-300 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function SiteFooter() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const cols = [
    { title: 'Products', links: [['Personal', '/personal'], ['Business', '/business'], ['Cards', '/cards'], ['Savings', '/savings'], ['Loans', '/loans'], ['International', '/international'], ['Pricing', '/pricing']] },
    { title: 'Company', links: [['About', '/about'], ['Careers', '/careers'], ['Press', '/press'], ['Blog', '/blog'], ['Security', '/security'], ['System status', '/status']] },
    { title: 'Support', links: [['Help centre', '/help'], ['Contact us', '/contact'], ['Complaints', '/legal/complaints'], ['Report fraud', '/contact?topic=fraud']] },
    { title: 'Legal', links: [['Terms', '/legal/terms'], ['Privacy', '/legal/privacy'], ['Cookies', '/legal/cookies'], ['Compliance', '/legal/compliance']] },
  ];
  return (
    <footer className="bg-navy-900 text-navy-200">
      <div className="container-x grid gap-12 py-16 lg:grid-cols-[1.3fr_2fr]">
        <div>
          <Logo light />
          <p className="mt-4 max-w-sm text-sm leading-6 text-navy-300">Private-grade banking for everyone. Hold, move and grow your money in dollars, euros and pounds — securely.</p>
          <form
            className="mt-6 flex max-w-sm gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const r = await api.post<{ message: string }>('/public/newsletter', { email });
                toast.success(r.message);
                setEmail('');
              } catch (err) {
                toast.error((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email for money tips"
              className="h-11 flex-1 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-navy-400 focus:border-gold-500 focus:outline-none"
            />
            <Button variant="gold" loading={busy}>
              Subscribe
            </Button>
          </form>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {cols.map((c) => (
            <div key={c.title}>
              <p className="text-xs font-semibold uppercase tracking-widest text-gold-400">{c.title}</p>
              <ul className="mt-4 space-y-2.5">
                {c.links.map(([l, h]) => (
                  <li key={h}>
                    <Link href={h} className="text-sm text-navy-200 hover:text-white">
                      {l}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-x flex flex-col gap-3 py-6 text-xs text-navy-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} [Company legal name]. [Banking licence / partner-bank disclosure — e.g. “Banking services provided by [Partner Bank], Member FDIC.”]</p>
          <p>1 Gold Street, New York, NY 10004 · +1 (800) 555-0101</p>
        </div>
      </div>
    </footer>
  );
}

export function CookieBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(!localStorage.getItem('ob_cookies')), []);
  if (!show) return null;
  const choose = (v: string) => {
    localStorage.setItem('ob_cookies', v);
    setShow(false);
  };
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl animate-fade-up rounded-2xl border border-navy-100 bg-white p-5 shadow-lift sm:inset-x-6">
      <p className="text-sm text-navy-700">
        We use essential cookies to keep you signed in and secure, and optional analytics cookies to improve One Bank. See our{' '}
        <Link href="/legal/cookies" className="font-semibold text-navy-900 underline">
          cookie policy
        </Link>
        .
      </p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => choose('essential')}>
          Essential only
        </Button>
        <Button variant="primary" size="sm" onClick={() => choose('all')}>
          Accept all
        </Button>
      </div>
    </div>
  );
}

/** Premium card visual used on marketing pages and in the app. */
export function CardVisual({ brand = 'VISA', last4 = '4821', name = 'ALEX MORGAN', exp = '11/29', color = 'navy', className, pan }: { brand?: string; last4?: string; name?: string; exp?: string; color?: string; className?: string; pan?: string }) {
  const bg =
    color === 'gold'
      ? 'bg-[linear-gradient(135deg,#E3C55A_0%,#C9A227_50%,#856816_100%)] text-navy-900'
      : color === 'black'
        ? 'bg-[linear-gradient(135deg,#2a2a2a_0%,#0d0d0d_100%)] text-white'
        : color === 'emerald'
          ? 'bg-[linear-gradient(135deg,#0f5a45_0%,#06372a_100%)] text-white'
          : 'bg-[linear-gradient(135deg,#1A2C5B_0%,#0B1B3F_55%,#040B1C_100%)] text-white';
  return (
    <div className={cn('relative aspect-[1.586] w-full max-w-[380px] overflow-hidden rounded-[22px] p-6 shadow-lift', bg, className)}>
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-gold-400/20 blur-3xl" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <span className="font-serif text-lg tracking-wide">
            One<span className={color === 'gold' ? 'text-navy-900' : 'text-gold-400'}>Bank</span>
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-70">Virtual</span>
        </div>
        <div className="h-9 w-12 rounded-md bg-[linear-gradient(135deg,#F5EBC6,#C9A227)] opacity-90" />
        <div>
          <p className="font-mono text-lg tracking-[0.18em] sm:text-xl">{pan ?? `•••• •••• •••• ${last4}`}</p>
          <div className="mt-3 flex items-end justify-between text-xs">
            <div>
              <p className="text-[9px] uppercase tracking-widest opacity-60">Card holder</p>
              <p className="font-semibold tracking-wider">{name}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest opacity-60">Expires</p>
              <p className="font-semibold">{exp}</p>
            </div>
            <span className="font-serif text-xl italic">{brand === 'MASTERCARD' ? <MasterLogo /> : 'VISA'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MasterLogo() {
  return (
    <span className="relative flex">
      <span className="h-7 w-7 rounded-full bg-[#EB001B]" />
      <span className="-ml-3 h-7 w-7 rounded-full bg-[#F79E1B] mix-blend-screen" />
    </span>
  );
}

export function FxCalculator({ className }: { className?: string }) {
  const { data } = useQuery({ queryKey: ['public-rates'], queryFn: () => api.get<{ from: string; to: string; mid: string; buy: string }[]>('/public/fx-rates') });
  const [from, setFrom] = useState<Currency>('USD');
  const [to, setTo] = useState<Currency>('EUR');
  const [amount, setAmount] = useState('1000');
  const rate = data?.find((r) => r.from === from && r.to === to);
  const out = rate ? (Number(amount || 0) * Number(rate.buy)).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '—';
  return (
    <div className={cn('rounded-3xl border border-navy-100 bg-white p-6 shadow-card', className)}>
      <p className="eyebrow">Live exchange rates</p>
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-2 rounded-2xl border border-navy-100 p-3">
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} className="w-full bg-transparent font-sans tabular-nums tracking-tight text-2xl font-semibold text-navy-800 focus:outline-none" aria-label="Amount" />
          <select value={from} onChange={(e) => setFrom(e.target.value as Currency)} className="rounded-full bg-navy-50 px-3 py-2 text-sm font-semibold text-navy-800">
            {MARKETING_CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-gold-200 bg-gold-50/60 p-3">
          <p className="w-full font-sans tabular-nums tracking-tight text-2xl font-semibold text-navy-800">{from === to ? amount : out}</p>
          <select value={to} onChange={(e) => setTo(e.target.value as Currency)} className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-navy-800">
            {MARKETING_CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-3 text-xs text-navy-400">
        {rate ? `1 ${from} = ${Number(rate.buy).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${to} · mid-market ${Number(rate.mid).toLocaleString('en-US', { maximumFractionDigits: 4 })}` : 'Loading rates…'}
      </p>
      <p className="mt-1 text-xs text-navy-400">
        {CURRENCY_META[from].name} → {CURRENCY_META[to].name}
      </p>
    </div>
  );
}

export function CtaBand({ title = 'Banking that feels like a private client service.', body = 'Open your One Bank account in under five minutes. No paperwork, no monthly fees.' }: { title?: string; body?: string }) {
  return (
    <section className="container-x py-20">
      <div className="relative overflow-hidden rounded-[32px] bg-navy-deep px-8 py-14 text-center sm:px-16">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[600px] -translate-x-1/2 rounded-full bg-gold-500/20 blur-3xl" />
        <h2 className="relative mx-auto max-w-2xl font-display text-3xl text-white sm:text-4xl">{title}</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-navy-200">{body}</p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/signup">
            <Button variant="gold" size="lg">
              Open an account <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/contact">
            <Button variant="outlineLight" size="lg">
              Talk to us
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

export function PageHero({ eyebrow, title, body, children }: { eyebrow: string; title: React.ReactNode; body: string; children?: React.ReactNode }) {
  return (
    <section className="border-b border-navy-100/60 bg-white pt-32">
      <div className="container-x grid items-center gap-12 pb-16 lg:grid-cols-2">
        <div className="animate-fade-up">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="h-display mt-4 text-navy-800">{title}</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-navy-500">{body}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup">
              <Button variant="gold" size="lg">
                Get started <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline" size="lg">
                See pricing
              </Button>
            </Link>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">{children}</div>
      </div>
    </section>
  );
}

export function FeatureGrid({ items }: { items: { icon: React.ReactNode; title: string; body: string }[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((f) => (
        <div key={f.title} className="group rounded-3xl border border-navy-100 bg-white p-7 transition hover:-translate-y-1 hover:shadow-card">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-navy-800 text-gold-300 transition group-hover:bg-gold-sheen group-hover:text-navy-900">{f.icon}</div>
          <h3 className="mt-5 font-serif text-xl text-navy-800">{f.title}</h3>
          <p className="mt-2 text-sm leading-6 text-navy-500">{f.body}</p>
        </div>
      ))}
    </div>
  );
}
