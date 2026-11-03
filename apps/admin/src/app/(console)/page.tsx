'use client';

import { formatMoney } from '@onebank/shared';
import { Card, CardHeader, PageHeader, Skeleton, Stat, cn, compactUsd, entryLabel, timeAgo } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeftRight, Banknote, CircleDollarSign, Landmark, LifeBuoy, MonitorSmartphone, ShieldCheck, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_COLORS } from '@/components/charts';
import { api } from '@/lib/api';

interface Overview {
  kpis: {
    users: number;
    newToday: number;
    newWeek: number;
    activeSessions: number;
    depositsUsd: string;
    volumeToday: { usd: string; count: number };
    volumeWeek: { usd: string; count: number };
    volumeMonth: { usd: string; count: number };
    feesMonthUsd: string;
    pendingKyc: number;
    openTickets: number;
    reviewQueue: number;
    openFlags: number;
    pendingLoans: number;
    loansOutstandingUsd: string;
  };
  deposits: { currency: string; total: string }[];
  statuses: { label: string; count: number }[];
  kycLevels: { label: string; count: number }[];
  signups: { day: string; count: number }[];
  flows: { day: string; inflow: string; outflow: string }[];
  byType: { type: string; totalUsd: string; count: number }[];
  devices: { label: string; count: number }[];
  countries: { label: string; count: number }[];
}
interface ActivityItem {
  kind: string;
  at: string;
  title: string;
  detail: string;
  link?: string;
}

const tip = { contentStyle: { borderRadius: 12, border: '1px solid #D6DCEC', fontSize: 12 } };
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['overview'], queryFn: () => api.get<Overview>('/admin/overview'), refetchInterval: 30_000 });
  const { data: activity } = useQuery({ queryKey: ['activity'], queryFn: () => api.get<ActivityItem[]>('/admin/activity'), refetchInterval: 15_000 });
  if (isLoading || !data)
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  const k = data.kpis;
  return (
    <>
      <PageHeader title="Bank overview" subtitle={`Live as of ${new Date().toLocaleTimeString()}`} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat tone="navy" label="Customer deposits" value={compactUsd(k.depositsUsd)} sub="USD equivalent, all currencies" icon={<CircleDollarSign className="h-5 w-5" />} />
        <Stat label="Customers" value={k.users.toLocaleString()} sub={`+${k.newToday} today · +${k.newWeek} this week`} icon={<Users className="h-5 w-5" />} />
        <Stat label="Volume today" value={compactUsd(k.volumeToday.usd)} sub={`${k.volumeToday.count} transactions · ${compactUsd(k.volumeMonth.usd)} 30d`} icon={<ArrowLeftRight className="h-5 w-5" />} />
        <Stat label="Fee revenue (30d)" value={compactUsd(k.feesMonthUsd)} sub={`Loans outstanding ${compactUsd(k.loansOutstandingUsd)}`} icon={<Banknote className="h-5 w-5" />} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {[
          ['Online now', k.activeSessions, MonitorSmartphone, '/sessions'],
          ['KYC pending', k.pendingKyc, ShieldCheck, '/kyc'],
          ['Review queue', k.reviewQueue, AlertTriangle, '/risk'],
          ['Fraud flags', k.openFlags, AlertTriangle, '/risk'],
          ['Open tickets', k.openTickets, LifeBuoy, '/support'],
          ['Loan applications', k.pendingLoans, Landmark, '/loans'],
        ].map(([l, v, Icon, href]) => {
          const I = Icon as typeof Users;
          return (
            <Link key={l as string} href={href as string} className={cn('rounded-2xl border bg-white p-4 shadow-card transition hover:-translate-y-0.5', (v as number) > 0 && l !== 'Online now' ? 'border-gold-300' : 'border-navy-100/70')}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-navy-400">{l as string}</p>
                <I className="h-4 w-4 text-gold-600" />
              </div>
              <p className="mt-2 font-sans tabular-nums tracking-tight text-2xl font-semibold text-navy-800">{v as number}</p>
            </Link>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Money in vs out (30 days)" subtitle="Customer wallet flows, USD equivalent" />
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.flows.map((f) => ({ day: day(f.day), In: Number(f.inflow), Out: Number(f.outflow) }))}>
              <defs>
                <linearGradient id="in" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#C9A227" stopOpacity={0.35} />
                  <stop offset="1" stopColor="#C9A227" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="out" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#0B1B3F" stopOpacity={0.25} />
                  <stop offset="1" stopColor="#0B1B3F" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#EEF1F8" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#7F8FB8' }} tickLine={false} axisLine={false} interval={4} />
              <YAxis tick={{ fontSize: 11, fill: '#7F8FB8' }} tickLine={false} axisLine={false} tickFormatter={(v) => compactUsd(v)} width={60} />
              <Tooltip {...tip} formatter={(v: number) => formatMoney(v, 'USD')} />
              <Area type="monotone" dataKey="In" stroke="#C9A227" strokeWidth={2} fill="url(#in)" />
              <Area type="monotone" dataKey="Out" stroke="#0B1B3F" strokeWidth={2} fill="url(#out)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <CardHeader title="Live activity" />
          <div className="max-h-[280px] space-y-3 overflow-y-auto pr-1">
            {activity?.map((a, i) => {
              const inner = (
                <div className="flex gap-3">
                  <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', a.kind === 'fraud' ? 'bg-danger' : a.kind === 'failed_login' ? 'bg-warning' : a.kind === 'signup' ? 'bg-success' : 'bg-gold-500')} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium capitalize text-navy-800">{a.title}</p>
                    <p className="truncate text-xs text-navy-400">
                      {a.detail} · {timeAgo(a.at)}
                    </p>
                  </div>
                </div>
              );
              return a.link ? (
                <Link key={i} href={a.link} className="block rounded-lg hover:bg-ivory">
                  {inner}
                </Link>
              ) : (
                <div key={i}>{inner}</div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Sign-ups (30 days)" subtitle={<span className="inline-flex items-center gap-1"><UserPlus className="h-3.5 w-3.5" /> new customers per day</span>} />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.signups.map((s) => ({ day: day(s.day), count: s.count }))}>
              <XAxis dataKey="day" hide />
              <YAxis allowDecimals={false} width={30} tick={{ fontSize: 11, fill: '#7F8FB8' }} axisLine={false} tickLine={false} />
              <Tooltip {...tip} />
              <Bar dataKey="count" fill="#0B1B3F" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <CardHeader title="Volume by type (30 days)" />
          <div className="space-y-2.5">
            {data.byType.slice(0, 7).map((t) => {
              const max = Number(data.byType[0]?.totalUsd ?? 1);
              return (
                <div key={t.type}>
                  <div className="flex justify-between text-xs">
                    <span className="capitalize text-navy-600">{entryLabel(t.type)}</span>
                    <span className="font-semibold text-navy-800">
                      {compactUsd(t.totalUsd)} · {t.count}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-navy-50">
                    <div className="h-1.5 rounded-full bg-gold-500" style={{ width: `${(Number(t.totalUsd) / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <CardHeader title="Deposits by currency" />
          <div className="space-y-3">
            {data.deposits.map((d) => (
              <div key={d.currency} className="flex items-center justify-between rounded-xl bg-ivory px-3 py-2.5">
                <span className="text-sm font-semibold text-navy-700">{d.currency}</span>
                <span className="font-sans tabular-nums tracking-tight text-lg font-semibold text-navy-800">{formatMoney(d.total, d.currency)}</span>
              </div>
            ))}
          </div>
        </Card>
        {(
          [
            ['Customers by status', data.statuses],
            ['KYC levels', data.kycLevels],
            ['Sign-ins by browser (30d)', data.devices],
          ] as const
        ).map(([title, rows]) => (
          <Card key={title}>
            <CardHeader title={title} />
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={rows.map((r) => ({ name: r.label.replace(/_/g, ' ').toLowerCase(), value: r.count }))} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">
                  {rows.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...tip} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        ))}
      </div>
    </>
  );
}
