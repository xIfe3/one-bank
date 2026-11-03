'use client';

import { Card, Input, PageHeader, Pagination, Select, Skeleton, Stat, StatusBadge, Table, Td, qs, timeAgo } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { Clock, Inbox, Search, Timer } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, useAdmin, type Paged } from '@/lib/api';

interface Ticket {
  id: string;
  number: number;
  subject: string;
  category: string;
  priority: string;
  status: string;
  lastActivityAt: string;
  user: { id: string; firstName: string; lastName: string; email: string };
  assignedAdmin: { id: string; firstName: string } | null;
}

export default function Support() {
  const admin = useAdmin();
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [assigned, setAssigned] = useState('');
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 350);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isLoading } = useQuery({
    queryKey: ['tickets', status, priority, assigned, dq, page],
    queryFn: () => api.get<Paged<Ticket> & { sla: { avgFirstResponseHours: string | null; avgResolutionHours: string | null } }>(`/admin/tickets${qs({ status, priority, assigned, q: dq, page })}`),
    refetchInterval: 20_000,
  });
  return (
    <>
      <PageHeader title="Support inbox" />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="In this view" value={data?.total ?? '—'} icon={<Inbox className="h-5 w-5" />} />
        <Stat label="Avg first response (30d)" value={data?.sla.avgFirstResponseHours ? `${data.sla.avgFirstResponseHours}h` : '—'} icon={<Clock className="h-5 w-5" />} />
        <Stat label="Avg resolution (30d)" value={data?.sla.avgResolutionHours ? `${data.sla.avgResolutionHours}h` : '—'} icon={<Timer className="h-5 w-5" />} />
      </div>
      <Card className="mb-4" padded={false}>
        <div className="grid gap-3 p-4 md:grid-cols-[1fr_170px_150px_170px]">
          <Input prefix={<Search className="h-4 w-4" />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Subject or customer email" />
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="">Open & pending</option>
            {['OPEN', 'PENDING', 'RESOLVED', 'CLOSED', 'ALL'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <Select value={priority} onChange={(e) => (setPriority(e.target.value), setPage(1))}>
            <option value="">Any priority</option>
            {['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <Select value={assigned} onChange={(e) => (setAssigned(e.target.value), setPage(1))}>
            <option value="">Anyone</option>
            <option value={admin.id}>Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </Select>
        </div>
      </Card>
      <Card>
        {isLoading ? (
          <Skeleton className="h-80" />
        ) : (
          <>
            <Table head={['#', 'Subject', 'Customer', 'Category', 'Priority', 'Status', 'Agent', 'Activity']}>
              {data?.items.map((t) => (
                <tr key={t.id} className="hover:bg-ivory">
                  <Td className="text-xs text-navy-400">{t.number}</Td>
                  <Td>
                    <Link href={`/support/${t.id}`} className="font-semibold text-navy-800 hover:underline">
                      {t.subject}
                    </Link>
                  </Td>
                  <Td className="text-xs">
                    {t.user.firstName} {t.user.lastName}
                    <br />
                    <span className="text-navy-400">{t.user.email}</span>
                  </Td>
                  <Td className="text-xs">{t.category}</Td>
                  <Td>
                    <StatusBadge status={t.priority} />
                  </Td>
                  <Td>
                    <StatusBadge status={t.status} />
                  </Td>
                  <Td className="text-xs">{t.assignedAdmin?.firstName ?? '—'}</Td>
                  <Td className="text-xs">{timeAgo(t.lastActivityAt)}</Td>
                </tr>
              ))}
            </Table>
            {data && <Pagination page={data.page} pages={data.pages} onChange={setPage} />}
          </>
        )}
      </Card>
    </>
  );
}
