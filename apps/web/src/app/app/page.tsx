'use client';

import { CURRENCY_META, formatMoney } from '@onebank/shared';
import { Button, Card, CardHeader, CurrencyFlag, EmptyState, Money, Skeleton, cn } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, ArrowRight, Copy, CreditCard, Eye, EyeOff, Plus, Receipt, RefreshCw, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AddMoneyModal } from '@/components/actions';
import { CHART_COLORS, FlowChart } from '@/components/charts';
import { TxItem } from '@/components/tx';
import { api, type Account, type TxRow } from '@/lib/api';
import { useMe } from '@/lib/session';

interface Dashboard {
  summary: { baseCurrency: string; totalBalance: string; accounts: Account[] };
  recent: TxRow[];
  insights: { monthly: { month: string; inflow: string; outflow: string }[]; categories: { name: string; total: string; percent: number }[]; currency: string; totals: { inflow: string; outflow: string } };
  goals: { id: string; name: string; currency: string; balance: string; target: string }[];
  cardCount: number;
}

export default function Dashboard() {
  const me = useMe();
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard') });
  const [hidden, setHidden] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  useEffect(() => setHidden(localStorage.getItem('ob_hide') === '1'), []);
  const toggle = () => {
    localStorage.setItem('ob_hide', hidden ? '0' : '1');
    setHidden(!hidden);
  };
  const mask = (s: string) => (hidden ? '••••••' : s);

  if (isLoading || !data)
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-52 lg:col-span-2" />
        <Skeleton className="h-52" />
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    );

  const wallets = data.summary.accounts.filter((a) => a.type === 'CUSTOMER_WALLET');
  const other = data.summary.accounts.filter((a) => a.type !== 'CUSTOMER_WALLET' && a.type !== 'LOAN');

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="relative overflow-hidden border-0 bg-navy-deep text-white lg:col-span-2">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-gold-500/20 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <p className="text-sm text-navy-200">Total balance · {data.summary.baseCurrency}</p>
              <button onClick={toggle} className="rounded-full p-2 text-navy-200 hover:bg-white/10" aria-label={hidden ? 'Show balances' : 'Hide balances'}>
                {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-2 font-sans tabular-nums tracking-tight text-4xl font-semibold tracking-tight sm:text-5xl">{mask(formatMoney(data.summary.totalBalance, data.summary.baseCurrency))}</p>
            <p className="mt-1 text-xs text-navy-300">Across {data.summary.accounts.filter((a) => a.type !== 'LOAN').length} accounts, converted at today’s mid-market rates</p>
            <div className="mt-8 grid grid-cols-4 gap-2 sm:gap-3">
              {[
                { label: 'Add money', icon: Plus, onClick: () => setAddOpen(true) },
                { label: 'Send', icon: ArrowLeftRight, href: '/app/transfer' },
                { label: 'Pay bills', icon: Receipt, href: '/app/bills' },
                { label: 'Exchange', icon: RefreshCw, href: '/app/accounts?exchange=1' },
              ].map((a) => {
                const inner = (
                  <span className="flex flex-col items-center gap-2 rounded-2xl bg-white/10 px-2 py-3 text-xs font-medium transition hover:bg-white/15">
                    <a.icon className="h-5 w-5 text-gold-300" />
                    {a.label}
                  </span>
                );
                return a.href ? (
                  <Link key={a.label} href={a.href}>
                    {inner}
                  </Link>
                ) : (
                  <button key={a.label} onClick={a.onClick}>
                    {inner}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="This month" subtitle="Money in vs money out" />
          {(() => {
            const m = data.insights.monthly.at(-1);
            const inn = Number(m?.inflow ?? 0);
            const out = Number(m?.outflow ?? 0);
            const max = Math.max(inn, out, 1);
            return (
              <div className="space-y-5">
                {[
                  ['Money in', inn, 'bg-gold-500'],
                  ['Money out', out, 'bg-navy-800'],
                ].map(([l, v, c]) => (
                  <div key={l as string}>
                    <div className="flex justify-between text-sm">
                      <span className="text-navy-500">{l}</span>
                      <span className="font-semibold text-navy-800">{mask(formatMoney(v as number, data.insights.currency))}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-navy-50">
                      <div className={cn('h-2 rounded-full', c as string)} style={{ width: `${((v as number) / max) * 100}%` }} />
                    </div>
                  </div>
                ))}
                <div className="space-y-2 border-t border-navy-50 pt-4">
                  {data.insights.categories.slice(0, 4).map((c, i) => (
                    <div key={c.name} className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[i] }} />
                      <span className="flex-1 text-navy-600">{c.name}</span>
                      <span className="text-navy-400">{c.percent}%</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg text-navy-800">Your accounts</h2>
          <Link href="/app/accounts" className="text-sm font-semibold text-navy-600 hover:text-navy-900">
            Manage <ArrowRight className="inline h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {wallets.map((a) => (
            <Card key={a.id} className="group">
              <div className="flex items-center justify-between">
                <CurrencyFlag currency={a.currency} />
                {a.status !== 'ACTIVE' ? <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-700">{a.status}</span> : a.isPrimary && <span className="rounded-full bg-gold-50 px-2 py-0.5 text-[10px] font-bold uppercase text-gold-700">Primary</span>}
              </div>
              <p className="mt-4 text-xs text-navy-400">{a.name}</p>
              <p className="font-sans tabular-nums tracking-tight text-xl font-semibold text-navy-800">{mask(formatMoney(a.availableBalance, a.currency))}</p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(a.accountNumber ?? '');
                  toast.success('Account number copied');
                }}
                className="mt-2 flex items-center gap-1.5 text-xs text-navy-400 hover:text-navy-700"
              >
                {a.accountNumber} <Copy className="h-3 w-3" />
              </button>
            </Card>
          ))}
          {other.slice(0, Math.max(0, 4 - wallets.length)).map((a) => (
            <Card key={a.id}>
              <div className="flex items-center justify-between">
                {a.type === 'CARD' ? <CreditCard className="h-6 w-6 text-navy-500" /> : <Wallet className="h-6 w-6 text-gold-600" />}
              </div>
              <p className="mt-4 text-xs text-navy-400">{a.name}</p>
              <p className="font-sans tabular-nums tracking-tight text-xl font-semibold text-navy-800">{mask(formatMoney(a.balance, a.currency))}</p>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader
            title="Recent activity"
            action={
              <Link href="/app/transactions" className="text-sm font-semibold text-navy-600 hover:text-navy-900">
                See all
              </Link>
            }
          />
          {data.recent.length ? (
            <div className="-mx-2">
              {data.recent.map((t) => (
                <TxItem key={t.rowId} t={t} showAccount />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Wallet className="h-6 w-6" />} title="No transactions yet" body="Add money to your account to get started." action={<Button onClick={() => setAddOpen(true)}>Add money</Button>} />
          )}
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Cash flow" subtitle={`Last 6 months · ${data.insights.currency}`} />
            <FlowChart data={data.insights.monthly} currency={data.insights.currency} height={200} />
          </Card>
          <Card>
            <CardHeader
              title="Savings goals"
              action={
                <Link href="/app/savings" className="text-sm font-semibold text-navy-600 hover:text-navy-900">
                  View
                </Link>
              }
            />
            {data.goals.length ? (
              <div className="space-y-4">
                {data.goals.map((g) => {
                  const pct = Math.min(100, (Number(g.balance) / Number(g.target)) * 100);
                  return (
                    <div key={g.id}>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-navy-800">{g.name}</span>
                        <span className="text-navy-400">
                          <Money amount={g.balance} currency={g.currency} /> / <Money amount={g.target} currency={g.currency} />
                        </span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-navy-50">
                        <div className="h-2 rounded-full bg-gold-sheen" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-navy-400">
                No goals yet.{' '}
                <Link href="/app/savings" className="font-semibold text-navy-700 underline">
                  Start saving
                </Link>
              </p>
            )}
          </Card>
        </div>
      </div>
      {me && <AddMoneyModal open={addOpen} onClose={() => setAddOpen(false)} accounts={data.summary.accounts} />}
    </div>
  );
}
