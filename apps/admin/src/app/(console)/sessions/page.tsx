'use client';

import { Badge, Button, Card, Input, PageHeader, Pagination, Skeleton, Stat, Table, Tabs, Td, fmtDateTime, qs, timeAgo } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { MonitorSmartphone, Search, Wifi } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ActionModal, type ActionSpec } from '@/components/action-modal';
import { api, can, useAdmin, type Paged } from '@/lib/api';

interface S {
  id: string;
  browser: string;
  os: string;
  deviceType: string;
  ip: string;
  location: string;
  createdAt: string;
  lastSeenAt: string;
  user: { id: string; email: string; firstName: string; lastName: string } | null;
  admin: { id: string; email: string; firstName: string; lastName: string; role: string } | null;
}

export default function Sessions() {
  const admin = useAdmin();
  const [realm, setRealm] = useState<'user' | 'admin' | ''>('user');
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<ActionSpec | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 350);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isLoading } = useQuery({ queryKey: ['sessions', realm, dq, page], queryFn: () => api.get<Paged<S> & { onlineNow: number }>(`/admin/sessions${qs({ realm, q: dq, page })}`), refetchInterval: 20_000 });
  return (
    <>
      <PageHeader title="Active sessions" subtitle="Every signed-in device across the platform." />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Stat label="Active sessions (this view)" value={data?.total ?? '—'} icon={<MonitorSmartphone className="h-5 w-5" />} />
        <Stat tone="navy" label="Online in last 5 minutes" value={data?.onlineNow ?? '—'} icon={<Wifi className="h-5 w-5" />} />
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={realm}
          onChange={(v) => (setRealm(v), setPage(1))}
          tabs={[
            { value: 'user', label: 'Customers' },
            { value: 'admin', label: 'Staff' },
            { value: '', label: 'All' },
          ]}
        />
        <div className="w-full sm:w-80">
          <Input prefix={<Search className="h-4 w-4" />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Email or IP" />
        </div>
      </div>
      <Card>
        {isLoading ? (
          <Skeleton className="h-80" />
        ) : (
          <>
            <Table head={['Who', 'Device', 'Location', 'IP', 'Signed in', 'Last active', '']}>
              {data?.items.map((s) => (
                <tr key={s.id}>
                  <Td>
                    {s.user ? (
                      <Link href={`/users/${s.user.id}`} className="font-semibold text-navy-800 hover:underline">
                        {s.user.firstName} {s.user.lastName}
                        <span className="block text-xs font-normal text-navy-400">{s.user.email}</span>
                      </Link>
                    ) : (
                      <span className="font-semibold text-navy-800">
                        {s.admin?.firstName} {s.admin?.lastName} <Badge tone="gold">{s.admin?.role}</Badge>
                        <span className="block text-xs font-normal text-navy-400">{s.admin?.email}</span>
                      </span>
                    )}
                  </Td>
                  <Td>
                    {s.browser} · {s.os}
                  </Td>
                  <Td>{s.location}</Td>
                  <Td className="font-mono text-xs">{s.ip}</Td>
                  <Td className="text-xs">{fmtDateTime(s.createdAt)}</Td>
                  <Td className="text-xs">
                    {Date.now() - new Date(s.lastSeenAt).getTime() < 5 * 60_000 ? <Badge tone="success" dot>Online</Badge> : timeAgo(s.lastSeenAt)}
                  </Td>
                  <Td>
                    {can(admin, 'ADMIN', 'SUPPORT', 'COMPLIANCE') && (!s.admin || admin.role === 'SUPERADMIN') && (
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setAction({ title: 'Revoke session', confirmLabel: 'Revoke', reason: false, danger: true, success: 'Session revoked', run: () => api.del(`/admin/sessions/${s.id}`) })}>
                        Revoke
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
            {data && <Pagination page={data.page} pages={data.pages} onChange={setPage} />}
          </>
        )}
      </Card>
      <ActionModal spec={action} onClose={() => setAction(null)} />
    </>
  );
}
