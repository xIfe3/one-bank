'use client';

import { formatMoney } from '@onebank/shared';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export const CHART_COLORS = ['#0B1B3F', '#C9A227', '#4F6194', '#E3C55A', '#7F8FB8', '#856816', '#AEB9D6', '#2C3F73'];

const monthLabel = (m: string) => new Date(m + '-01').toLocaleDateString('en-GB', { month: 'short' });

export function FlowChart({ data, currency, height = 240 }: { data: { month: string; inflow: string; outflow: string }[]; currency: string; height?: number }) {
  const rows = data.map((d) => ({ month: monthLabel(d.month), In: Number(d.inflow), Out: Number(d.outflow) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} barGap={4}>
        <CartesianGrid vertical={false} stroke="#EEF1F8" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#7F8FB8', fontSize: 12 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: '#7F8FB8', fontSize: 11 }} width={60} tickFormatter={(v) => Intl.NumberFormat('en', { notation: 'compact' }).format(v)} />
        <Tooltip cursor={{ fill: '#F7F5EF' }} formatter={(v: number) => formatMoney(v, currency)} contentStyle={{ borderRadius: 12, border: '1px solid #D6DCEC' }} />
        <Bar dataKey="In" fill="#C9A227" radius={[6, 6, 0, 0]} maxBarSize={28} />
        <Bar dataKey="Out" fill="#0B1B3F" radius={[6, 6, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendChart({ data, height = 200 }: { data: { label: string; value: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C9A227" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#C9A227" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" hide />
        <YAxis hide />
        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #D6DCEC' }} />
        <Area type="monotone" dataKey="value" stroke="#C9A227" strokeWidth={2.5} fill="url(#gold)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, currency, height = 220 }: { data: { name: string; total: string }[]; currency: string; height?: number }) {
  const rows = data.slice(0, 7).map((d) => ({ name: d.name, value: Number(d.total) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="none">
          {rows.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => formatMoney(v, currency)} contentStyle={{ borderRadius: 12, border: '1px solid #D6DCEC' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
