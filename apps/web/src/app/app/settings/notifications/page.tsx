'use client';

import { Button, Card, CardHeader, Skeleton, Switch } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { handleError } from '@/lib/form';

interface Pref {
  category: string;
  inApp: boolean;
  email: boolean;
  locked: boolean;
}

const DESC: Record<string, string> = {
  SECURITY: 'Sign-ins, password, PIN and two-factor changes. Always on for your protection.',
  TRANSACTIONS: 'Money in and out, transfer updates, card payments and bills.',
  ACCOUNT: 'Savings, loans, verification and statements.',
  SUPPORT: 'Replies to your support tickets.',
  MARKETING: 'Product news, offers and money tips.',
};

export default function NotificationPrefs() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['prefs'], queryFn: () => api.get<Pref[]>('/me/notification-preferences') });
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => data && setPrefs(data), [data]);
  if (!data) return <Skeleton className="h-80" />;
  const set = (cat: string, k: 'inApp' | 'email', v: boolean) => setPrefs(prefs.map((p) => (p.category === cat ? { ...p, [k]: v } : p)));
  return (
    <Card>
      <CardHeader title="Notification preferences" subtitle="Choose how One Bank keeps you informed." />
      <div className="divide-y divide-navy-50">
        <div className="hidden grid-cols-[1fr_80px_80px] pb-2 text-xs font-semibold uppercase tracking-wider text-navy-400 sm:grid">
          <span />
          <span className="text-center">In-app</span>
          <span className="text-center">Email</span>
        </div>
        {prefs.map((p) => (
          <div key={p.category} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-4 sm:grid-cols-[1fr_80px_80px]">
            <div>
              <p className="font-semibold capitalize text-navy-800">{p.category.toLowerCase()}</p>
              <p className="text-sm text-navy-400">{DESC[p.category]}</p>
            </div>
            <div className="flex justify-center">
              <Switch label={`${p.category} in-app`} checked={p.inApp} disabled={p.locked} onChange={(v) => set(p.category, 'inApp', v)} />
            </div>
            <div className="flex justify-center">
              <Switch label={`${p.category} email`} checked={p.email} disabled={p.locked} onChange={(v) => set(p.category, 'email', v)} />
            </div>
          </div>
        ))}
      </div>
      <Button
        className="mt-4"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api.put('/me/notification-preferences', prefs.map(({ category, inApp, email }) => ({ category, inApp, email })));
            toast.success('Preferences saved');
            qc.invalidateQueries({ queryKey: ['prefs'] });
          } catch (e) {
            handleError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save preferences
      </Button>
    </Card>
  );
}
