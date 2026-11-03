'use client';

import { ENTRY_TYPES, ENTRY_TYPE_LABELS } from '@onebank/shared';
import { Button, Card, EmptyState, Input, PageHeader, Pagination, Select, Skeleton, qs } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { TxItem } from '@/components/tx';
import { api, type Account, type Paged, type TxRow } from '@/lib/api';

function TransactionsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get('q') ?? '');
  const filters = {
    accountId: params.get('accountId') ?? '',
    type: params.get('type') ?? '',
    status: params.get('status') ?? '',
    direction: params.get('direction') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    q: params.get('q') ?? '',
    page: Number(params.get('page') ?? 1),
  };
  const set = (patch: Partial<typeof filters>) => router.replace(`/app/transactions${qs({ ...filters, page: 1, ...patch })}`);
  useEffect(() => {
    const t = setTimeout(() => q !== filters.q && set({ q }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<{ accounts: Account[] }>('/accounts') });
  const { data, isLoading } = useQuery({ queryKey: ['transactions', filters], queryFn: () => api.get<Paged<TxRow>>(`/transactions${qs({ ...filters, pageSize: 25 })}`) });

  // Group rows by day for readability
  const groups = new Map<string, TxRow[]>();
  data?.items.forEach((t) => {
    const k = new Date(t.valueDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    groups.set(k, [...(groups.get(k) ?? []), t]);
  });

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle={data ? `${data.total.toLocaleString()} transactions` : undefined}
        actions={
          <Button
            variant="outline"
            icon={<Download className="h-4 w-4" />}
            onClick={() => api.download('GET', `/transactions/export.csv${qs(filters)}`, undefined, 'onebank-transactions.csv').then(() => toast.success('Export downloaded'))}
          >
            Export CSV
          </Button>
        }
      />
      <Card className="mb-5" padded={false}>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Input prefix={<Search className="h-4 w-4" />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description, reference…" aria-label="Search transactions" />
          </div>
          <Select value={filters.accountId} onChange={(e) => set({ accountId: e.target.value })} aria-label="Account">
            <option value="">All accounts</option>
            {accounts?.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select value={filters.type} onChange={(e) => set({ type: e.target.value })} aria-label="Type">
            <option value="">All types</option>
            {ENTRY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENTRY_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
          <Select value={filters.direction} onChange={(e) => set({ direction: e.target.value })} aria-label="Direction">
            <option value="">In & out</option>
            <option value="in">Money in</option>
            <option value="out">Money out</option>
          </Select>
          <Select value={filters.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
            <option value="">Any status</option>
            <option value="COMPLETED">Completed</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="REVERSED">Reversed</option>
          </Select>
          <Input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} aria-label="From date" />
          <Input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} aria-label="To date" />
        </div>
      </Card>
      <Card>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : data?.items.length ? (
          <>
            {[...groups.entries()].map(([day, rows]) => (
              <div key={day} className="mb-4">
                <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-navy-400">{day}</p>
                <div className="-mx-2">
                  {rows.map((t) => (
                    <TxItem key={t.rowId} t={t} showAccount />
                  ))}
                </div>
              </div>
            ))}
            <Pagination page={data.page} pages={data.pages} onChange={(p) => set({ page: p })} />
          </>
        ) : (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="No transactions found" body="Try adjusting your filters." />
        )}
      </Card>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <TransactionsPage />
    </Suspense>
  );
}
