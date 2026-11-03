'use client';

import { Badge, Button, Card, CardHeader, EmptyState, Skeleton, fmtDate } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { Copy, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface Referrals {
  code: string;
  link: string;
  referrals: { id: string; name: string; joinedAt: string; bonusPaid: boolean }[];
}

export default function ReferralsPage() {
  const { data } = useQuery({ queryKey: ['referrals'], queryFn: () => api.get<Referrals>('/me/referrals') });
  const { data: status } = useQuery({ queryKey: ['status'], queryFn: () => api.get<{ referralBonusUsd: number }>('/public/status') });
  if (!data) return <Skeleton className="h-80" />;
  const copy = (v: string) => {
    navigator.clipboard.writeText(v);
    toast.success('Copied to clipboard');
  };
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
      <Card className="border-0 bg-navy-deep text-white">
        <Gift className="h-10 w-10 text-gold-300" />
        <h2 className="mt-4 font-serif text-2xl">Invite friends, earn ${status?.referralBonusUsd ?? 10}</h2>
        <p className="mt-2 text-sm text-navy-200">You’ll get a bonus in your primary account when each friend you invite verifies their identity.</p>
        <div className="mt-6 rounded-2xl bg-white/10 p-4">
          <p className="text-xs uppercase tracking-wider text-navy-300">Your code</p>
          <p className="font-mono text-2xl font-semibold tracking-widest text-gold-300">{data.code}</p>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="gold" icon={<Copy className="h-4 w-4" />} onClick={() => copy(data.link)}>
            Copy invite link
          </Button>
          <Button variant="outlineLight" onClick={() => copy(data.code)}>
            Copy code
          </Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="Your referrals" subtitle={`${data.referrals.length} friend(s) joined`} />
        {data.referrals.length ? (
          <div className="divide-y divide-navy-50">
            {data.referrals.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-semibold text-navy-800">{r.name}</p>
                  <p className="text-xs text-navy-400">Joined {fmtDate(r.joinedAt)}</p>
                </div>
                {r.bonusPaid ? <Badge tone="success">Bonus paid</Badge> : <Badge tone="warning">Awaiting verification</Badge>}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Gift className="h-6 w-6" />} title="No referrals yet" body="Share your link to get started." />
        )}
      </Card>
    </div>
  );
}
