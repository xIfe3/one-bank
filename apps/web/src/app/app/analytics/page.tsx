'use client';

import { formatMoney } from '@onebank/shared';
import { Avatar, Card, CardHeader, EmptyState, PageHeader, Skeleton, Stat, Tabs } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, BarChart3, Scale } from 'lucide-react';
import { useState } from 'react';
import { CHART_COLORS, DonutChart, FlowChart } from '@/components/charts';
import { api } from '@/lib/api';

interface Insights {
  currency: string;
  monthly: { month: string; inflow: string; outflow: string }[];
  categories: { name: string; total: string; percent: number }[];
  topRecipients: { name: string; total: string; count: number }[];
  totals: { inflow: string; outflow: string };
}

export default function Analytics() {
  const [months, setMonths] = useState<'3' | '6' | '12'>('6');
  const { data, isLoading } = useQuery({ queryKey: ['analytics', months], queryFn: () => api.get<Insights>(`/analytics?months=${months}`) });
  if (isLoading || !data) return <Skeleton className="h-96" />;
  const net = Number(data.totals.inflow) - Number(data.totals.outflow);
  return (
    <>
      <PageHeader
        title="Insights"
        subtitle={`Your money at a glance, in ${data.currency}`}
        actions={<Tabs value={months} onChange={setMonths} tabs={[{ value: '3', label: '3M' }, { value: '6', label: '6M' }, { value: '12', label: '12M' }]} />}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Money in" value={formatMoney(data.totals.inflow, data.currency)} icon={<ArrowDownLeft className="h-5 w-5" />} />
        <Stat label="Money out" value={formatMoney(data.totals.outflow, data.currency)} icon={<ArrowUpRight className="h-5 w-5" />} />
        <Stat tone="navy" label="Net" value={formatMoney(net, data.currency, { sign: true })} sub={net >= 0 ? 'You saved more than you spent' : 'You spent more than you earned'} icon={<Scale className="h-5 w-5" />} />
      </div>
      <Card className="mt-6">
        <CardHeader title="Cash flow by month" subtitle="Gold = in, navy = out" />
        <FlowChart data={data.monthly} currency={data.currency} height={300} />
      </Card>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Spending by category" />
          {data.categories.length ? (
            <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
              <DonutChart data={data.categories} currency={data.currency} />
              <ul className="space-y-2.5">
                {data.categories.slice(0, 7).map((c, i) => (
                  <li key={c.name} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="flex-1 text-navy-700">{c.name}</span>
                    <span className="font-semibold text-navy-800">{formatMoney(c.total, data.currency)}</span>
                    <span className="w-10 text-right text-xs text-navy-400">{c.percent}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="No spending yet" />
          )}
        </Card>
        <Card>
          <CardHeader title="Top payees" />
          {data.topRecipients.length ? (
            <ul className="space-y-3">
              {data.topRecipients.map((r) => (
                <li key={r.name} className="flex items-center gap-3">
                  <Avatar name={r.name} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-navy-800">{r.name}</p>
                    <p className="text-xs text-navy-400">{r.count} payment(s)</p>
                  </div>
                  <p className="font-semibold text-navy-800">{formatMoney(r.total, data.currency)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-navy-400">No payments in this period.</p>
          )}
        </Card>
      </div>
    </>
  );
}
