'use client';

import { ENTRY_TYPES, ENTRY_TYPE_LABELS, formatMoney } from '@onebank/shared';
import { Badge, Card, Input, PageHeader, Pagination, Select, Skeleton, StatusBadge, Table, Td, entryLabel, fmtDateTime, qs } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type Paged } from '@/lib/api';

interface Row {
  id: string;
  reference: string;
  type: string;
  status: string;
  transferStatus?: string;
  description: string;
  counterparty: string | null;
  initiatorType: string;
  amount: string;
  currency: string;
  user: { id: string; name: string } | null;
  valueDate: string;
}

export default function Transactions() {
  const [f, setF] = useState({ q: '', type: '', status: '', currency: '', from: '', to: '' });
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => (setF((x) => ({ ...x, q })), setPage(1)), 350);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isLoading } = useQuery({ queryKey: ['admin-tx', f, page], queryFn: () => api.get<Paged<Row>>(`/admin/transactions${qs({ ...f, page })}`), refetchInterval: 20_000 });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => (setF({ ...f, [k]: e.target.value }), setPage(1));
  return (
    <>
      <PageHeader title="Transactions" subtitle={data ? `${data.total.toLocaleString()} journal entries` : undefined} />
      <Card className="mb-4" padded={false}>
        <div className="grid gap-3 p-4 md:grid-cols-6">
          <div className="md:col-span-2">
            <Input prefix={<Search className="h-4 w-4" />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, description, counterparty" />
          </div>
          <Select value={f.type} onChange={set('type')}>
            <option value="">All types</option>
            {ENTRY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENTRY_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
          <Select value={f.status} onChange={set('status')}>
            <option value="">Any status</option>
            {['COMPLETED', 'PENDING', 'FAILED', 'REVERSED'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <Input type="date" value={f.from} onChange={set('from')} aria-label="From" />
          <Input type="date" value={f.to} onChange={set('to')} aria-label="To" />
        </div>
      </Card>
      <Card>
        {isLoading ? (
          <Skeleton className="h-96" />
        ) : (
          <>
            <Table head={['Date', 'Reference', 'Customer', 'Description', 'Type', 'Amount', 'Status', 'By']}>
              {data?.items.map((t) => (
                <tr key={t.id} className="hover:bg-ivory">
                  <Td className="text-xs">{fmtDateTime(t.valueDate)}</Td>
                  <Td>
                    <Link href={`/transactions/${t.id}`} className="font-mono text-xs font-semibold text-navy-800 hover:underline">
                      {t.reference}
                    </Link>
                  </Td>
                  <Td>{t.user ? <Link href={`/users/${t.user.id}`} className="hover:underline">{t.user.name}</Link> : <span className="text-navy-400">System</span>}</Td>
                  <Td className="max-w-[240px] truncate">{t.description}</Td>
                  <Td className="text-xs">{entryLabel(t.type)}</Td>
                  <Td className={Number(t.amount) > 0 ? 'font-semibold text-success' : 'font-semibold'}>{t.currency ? formatMoney(t.amount, t.currency, { sign: true }) : '—'}</Td>
                  <Td>
                    <StatusBadge status={t.transferStatus ?? t.status} />
                  </Td>
                  <Td>
                    <Badge tone={t.initiatorType === 'ADMIN' ? 'gold' : t.initiatorType === 'SYSTEM' ? 'info' : 'neutral'}>{t.initiatorType.toLowerCase()}</Badge>
                  </Td>
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
