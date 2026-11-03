'use client';

import { Button, Card, CardHeader, KeyValue, Skeleton, Stat } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { Gauge } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Limits {
  kycLevel: number;
  label: string;
  dailyUsd: number;
  singleUsd: number;
  usedTodayUsd: number;
  remainingUsd: number;
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export default function LimitsPage() {
  const { data } = useQuery({ queryKey: ['limits'], queryFn: () => api.get<Limits>('/me/limits') });
  const { data: status } = useQuery({ queryKey: ['status'], queryFn: () => api.get<{ kycLimits: Record<string, { dailyUsd: number; singleUsd: number; label: string }>; otpThresholdUsd: number }>('/public/status') });
  if (!data) return <Skeleton className="h-80" />;
  const pct = data.dailyUsd ? Math.min(100, (data.usedTodayUsd / data.dailyUsd) * 100) : 0;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat tone="navy" label="Your level" value={`Level ${data.kycLevel}`} sub={data.label} icon={<Gauge className="h-5 w-5" />} />
        <Stat label="Daily limit" value={usd(data.dailyUsd)} sub={`${usd(data.singleUsd)} per transaction`} />
        <Stat label="Remaining today" value={usd(data.remainingUsd)} sub={`${usd(data.usedTodayUsd)} used`} />
      </div>
      <Card>
        <CardHeader title="Today’s usage" subtitle="Resets at midnight. All currencies are counted at their USD equivalent." />
        <div className="h-3 rounded-full bg-navy-50">
          <div className="h-3 rounded-full bg-gold-sheen" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm text-navy-500">
          {usd(data.usedTodayUsd)} of {usd(data.dailyUsd)} used
        </p>
        {status && <p className="mt-4 text-sm text-navy-500">Payments of {usd(status.otpThresholdUsd)} or more need an extra one-time code.</p>}
      </Card>
      {status && (
        <Card>
          <CardHeader title="Limits by verification level" action={data.kycLevel < 3 && <Link href="/app/settings/kyc"><Button size="sm" variant="gold">Upgrade</Button></Link>} />
          <KeyValue items={Object.entries(status.kycLimits).map(([lvl, l]) => [`Level ${lvl} · ${l.label}`, l.dailyUsd ? `${usd(l.dailyUsd)} / day · ${usd(l.singleUsd)} per payment` : 'Receive only'])} />
        </Card>
      )}
    </div>
  );
}
