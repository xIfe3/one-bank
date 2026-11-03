import { Button } from '@onebank/ui';
import { ArrowRight, BadgeCheck, Banknote, CreditCard, Globe2, Landmark, Lock, PiggyBank, ShieldCheck, Smartphone, Sparkles, Zap } from 'lucide-react';
import Link from 'next/link';
import { CardVisual, CtaBand, FeatureGrid, FxCalculator } from '@/components/marketing';

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-deep pb-24 pt-36 text-white">
        <div className="pointer-events-none absolute -right-40 top-10 h-[520px] w-[520px] rounded-full bg-gold-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-40 bottom-0 h-[420px] w-[420px] rounded-full bg-navy-500/30 blur-3xl" />
        <div className="container-x relative grid items-center gap-16 lg:grid-cols-[1.1fr_1fr]">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/10 px-3.5 py-1.5 text-xs font-semibold text-gold-300">
              <Sparkles className="h-3.5 w-3.5" /> Now with 10% p.a. fixed deposits
            </span>
            <h1 className="mt-6 font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              Private-grade banking, <span className="bg-gold-sheen bg-clip-text text-transparent">for everyone.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-navy-200">
              Hold dollars, euros and pounds in one account. Send money instantly, spend with virtual cards, and grow your wealth — protected by bank-grade security at every step.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/signup">
                <Button variant="gold" size="lg">
                  Open a free account <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/personal">
                <Button variant="outlineLight" size="lg">
                  Explore accounts
                </Button>
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-navy-300">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-gold-400" /> 2FA & device controls
              </span>
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-gold-400" /> Instant transfers
              </span>
              <span className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-gold-400" /> No monthly fees
              </span>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute -left-6 top-10 w-[88%] rotate-[-8deg] opacity-70">
              <CardVisual color="gold" last4="7710" brand="MASTERCARD" />
            </div>
            <div className="relative ml-auto w-[92%] rotate-[4deg]">
              <CardVisual />
            </div>
            <div className="relative -mt-6 ml-auto w-64 rounded-2xl border border-white/10 bg-white/95 p-4 text-navy-800 shadow-lift backdrop-blur">
              <p className="text-xs text-navy-400">Total balance</p>
              <p className="font-sans tabular-nums tracking-tight text-2xl font-semibold">$48,215.40</p>
              <div className="mt-3 flex gap-1.5 text-xs">
                {['$ USD', '€ EUR', '£ GBP'].map((c) => (
                  <span key={c} className="whitespace-nowrap rounded-full bg-navy-50 px-2 py-1 font-medium">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-b border-navy-100 bg-white">
        <div className="container-x grid grid-cols-2 gap-6 py-10 text-center sm:grid-cols-4">
          {[
            ['3', 'currencies in one account'],
            ['< 1s', 'transfers between members'],
            ['10%', 'p.a. on fixed deposits'],
            ['24/7', 'in-app support'],
          ].map(([k, v]) => (
            <div key={v}>
              <p className="font-sans tabular-nums tracking-tight text-3xl font-semibold text-navy-800">{k}</p>
              <p className="mt-1 text-sm text-navy-400">{v}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="container-x py-24">
        <div className="max-w-2xl">
          <p className="eyebrow">Everything in one place</p>
          <h2 className="h-section mt-3 text-navy-800">A complete bank in your pocket.</h2>
          <p className="mt-4 text-navy-500">From everyday spending to long-term saving, One Bank brings every financial tool together with the polish of a private bank.</p>
        </div>
        <div className="mt-12">
          <FeatureGrid
            items={[
              { icon: <Globe2 className="h-5 w-5" />, title: 'Multi-currency accounts', body: 'Open USD, EUR and GBP accounts in seconds and convert between them at transparent rates.' },
              { icon: <Zap className="h-5 w-5" />, title: 'Instant transfers', body: 'Pay anyone at One Bank instantly with their account number or @tag. Domestic and international transfers too.' },
              { icon: <CreditCard className="h-5 w-5" />, title: 'Virtual cards', body: 'Create cards in seconds, set spend limits, freeze them instantly and reveal details only with your PIN.' },
              { icon: <Banknote className="h-5 w-5" />, title: 'Bills & airtime', body: 'Pay electricity, TV, internet, water, airtime and data — with instant receipts and tokens.' },
              { icon: <PiggyBank className="h-5 w-5" />, title: 'Savings that work', body: 'Goals with auto-save, monthly interest and fixed deposits up to 10% p.a.' },
              { icon: <Landmark className="h-5 w-5" />, title: 'Fair, fast loans', body: 'Transparent rates and clear repayment schedules — no hidden fees, decisions in hours.' },
            ]}
          />
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white py-24">
        <div className="container-x grid items-center gap-16 lg:grid-cols-2">
          <div>
            <p className="eyebrow">How it works</p>
            <h2 className="h-section mt-3 text-navy-800">Open an account in three steps.</h2>
            <ol className="mt-10 space-y-8">
              {[
                ['Sign up in minutes', 'Tell us a little about yourself and verify your email. Your first account is ready instantly.'],
                ['Secure your account', 'Set a transaction PIN, turn on two-factor authentication and verify your identity for higher limits.'],
                ['Bank without borders', 'Add money, open new currency accounts, get a virtual card and start sending money worldwide.'],
              ].map(([t, b], i) => (
                <li key={t} className="flex gap-5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold-sheen font-serif text-lg text-navy-900">{i + 1}</span>
                  <div>
                    <p className="font-serif text-xl text-navy-800">{t}</p>
                    <p className="mt-1 text-navy-500">{b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <FxCalculator className="mx-auto w-full max-w-md" />
        </div>
      </section>

      {/* Security */}
      <section className="container-x py-24">
        <div className="grid gap-12 rounded-[32px] bg-navy-deep p-10 text-white sm:p-14 lg:grid-cols-2">
          <div>
            <p className="eyebrow text-gold-400">Security first</p>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl">Your money, guarded like a vault.</h2>
            <p className="mt-4 text-navy-200">We combine modern security engineering with the discipline of private banking. Every login, device and payment is protected.</p>
            <Link href="/security" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-gold-300 hover:text-gold-200">
              How we protect you <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              [<Lock key="l" className="h-5 w-5" />, 'Two-factor authentication', 'Authenticator apps and backup codes.'],
              [<Smartphone key="s" className="h-5 w-5" />, 'Device management', 'See every signed-in device and remove it remotely.'],
              [<ShieldCheck key="sh" className="h-5 w-5" />, 'Transaction PIN', 'Every payment is confirmed with your private PIN.'],
              [<BadgeCheck key="b" className="h-5 w-5" />, 'Real-time alerts', 'Instant notifications for every sign-in and payment.'],
            ].map(([icon, t, b]) => (
              <div key={t as string} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-gold-300">{icon}</div>
                <p className="mt-3 font-semibold">{t}</p>
                <p className="mt-1 text-sm text-navy-300">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-white py-24">
        <div className="container-x">
          <p className="eyebrow text-center">Loved by members</p>
          <h2 className="h-section mt-3 text-center text-navy-800">Banking people actually recommend.</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              ['“Paying my team in Lagos and London from one account used to take days. Now it takes seconds.”', 'Ngozi A.', 'Founder, Lagos'],
              ['“The fixed deposit rates are excellent and the app feels genuinely premium. I moved my savings over in a week.”', 'James W.', 'Architect, London'],
              ['“Virtual cards with spending limits changed how I manage subscriptions. Freezing a card takes one tap.”', 'Maria G.', 'Designer, New York'],
            ].map(([q, n, r]) => (
              <figure key={n} className="rounded-3xl border border-navy-100 bg-ivory p-8">
                <p className="font-display text-4xl leading-none text-gold-500">“</p>
                <blockquote className="mt-2 text-navy-700">{q.replace(/[“”]/g, '')}</blockquote>
                <figcaption className="mt-6">
                  <p className="font-semibold text-navy-800">{n}</p>
                  <p className="text-sm text-navy-400">{r}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* App download */}
      <section className="container-x py-24">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Bank on the go</p>
            <h2 className="h-section mt-3 text-navy-800">One Bank, wherever you are.</h2>
            <p className="mt-4 max-w-lg text-navy-500">Our responsive web app works beautifully on any phone, tablet or desktop. Native apps for iOS and Android are coming soon.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {['App Store — coming soon', 'Google Play — coming soon'].map((s) => (
                <span key={s} className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-5 py-3 text-sm font-semibold text-white">
                  <Smartphone className="h-4 w-4 text-gold-400" /> {s}
                </span>
              ))}
            </div>
          </div>
          <div className="flex justify-center">
            <div className="w-72 rounded-[44px] border-[10px] border-navy-900 bg-ivory p-4 shadow-lift">
              <div className="rounded-3xl bg-navy-deep p-5 text-white">
                <p className="text-xs text-navy-300">Good morning, Alex</p>
                <p className="mt-1 font-sans tabular-nums tracking-tight text-2xl font-semibold">$12,480.22</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px]">
                  {['Send', 'Pay', 'Cards'].map((a) => (
                    <span key={a} className="rounded-xl bg-white/10 py-2">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {[
                  ['Salary — Northwind', '+$6,850.00'],
                  ['Netflix', '-$15.49'],
                  ['Transfer to Ada', '-$220.00'],
                ].map(([t, a]) => (
                  <div key={t} className="flex justify-between rounded-xl bg-white px-3 py-2.5 text-xs">
                    <span className="text-navy-700">{t}</span>
                    <span className={a.startsWith('+') ? 'font-semibold text-success' : 'font-semibold text-navy-800'}>{a}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
