'use client';

import { Badge, Button, Card, Input, Modal, PageHeader, Pagination, Skeleton, Table, Td, fmtDateTime, qs } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { Download, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type Paged } from '@/lib/api';

interface Log {
  id: string;
  actorType: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}

export default function Audit() {
  const [f, setF] = useState({ q: '', action: '', from: '', to: '' });
  const [dq, setDq] = useState(f);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<Log | null>(null);
  useEffect(() => {
    const t = setTimeout(() => (setDq(f), setPage(1)), 350);
    return () => clearTimeout(t);
  }, [f]);
  const { data, isLoading } = useQuery({ queryKey: ['audit', dq, page], queryFn: () => api.get<Paged<Log>>(`/admin/audit${qs({ ...dq, page })}`) });
  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Every privileged action, who did it, why, and what changed."
        actions={
          <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => api.download('GET', `/admin/audit${qs({ ...dq, format: 'csv' })}`, undefined, 'onebank-audit.csv')}>
            Export CSV
          </Button>
        }
      />
      <Card className="mb-4" padded={false}>
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
          <Input prefix={<Search className="h-4 w-4" />} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Actor email, target ID, reason" />
          <Input value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} placeholder="Action (e.g. ledger., user.status)" />
          <Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          <Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        </div>
      </Card>
      <Card>
        {isLoading ? (
          <Skeleton className="h-96" />
        ) : (
          <>
            <Table head={['Time', 'Actor', 'Action', 'Target', 'Reason', 'IP', '']}>
              {data?.items.map((l) => (
                <tr key={l.id}>
                  <Td className="text-xs">{fmtDateTime(l.createdAt)}</Td>
                  <Td className="text-xs">
                    <Badge tone={l.actorType === 'ADMIN' ? 'gold' : 'neutral'}>{l.actorType}</Badge> {l.actorEmail}
                  </Td>
                  <Td className="font-mono text-xs">{l.action}</Td>
                  <Td className="text-xs">
                    {l.targetType === 'User' && l.targetId ? (
                      <Link href={`/users/${l.targetId}`} className="underline">
                        User
                      </Link>
                    ) : l.targetType === 'JournalEntry' && l.targetId ? (
                      <Link href={`/transactions/${l.targetId}`} className="underline">
                        Transaction
                      </Link>
                    ) : (
                      l.targetType ?? '—'
                    )}
                  </Td>
                  <Td className="max-w-xs truncate text-xs">{l.reason ?? '—'}</Td>
                  <Td className="font-mono text-xs">{l.ip ?? '—'}</Td>
                  <Td>
                    {(l.before != null || l.after != null) && (
                      <Button size="sm" variant="ghost" onClick={() => setView(l)}>
                        Diff
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
      {view && (
        <Modal open onClose={() => setView(null)} title={view.action} subtitle={`${view.actorEmail ?? view.actorType} · ${fmtDateTime(view.createdAt)}`} size="xl">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(['before', 'after'] as const).map((k) => (
              <div key={k}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-navy-400">{k}</p>
                <pre className="max-h-[50vh] overflow-auto rounded-xl bg-navy-950 p-3 text-[11px] text-gold-200">{JSON.stringify(view[k], null, 2) ?? '—'}</pre>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
