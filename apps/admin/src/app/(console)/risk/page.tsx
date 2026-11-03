'use client';

import { formatMoney } from '@onebank/shared';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Skeleton, StatusBadge, Table, Tabs, Td, fmtDateTime, timeAgo } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ActionModal, type ActionSpec } from '@/components/action-modal';
import { api, can, useAdmin } from '@/lib/api';

interface Review {
  id: string;
  kind: string;
  amount: string;
  fee: string;
  currency: string;
  recipientName: string;
  recipientAccount: string;
  recipientBankName: string | null;
  status: string;
  createdAt: string;
  entryId: string;
  user: { id: string; firstName: string; lastName: string; email: string; kycLevel: number };
  entry: { reference: string; fraudFlags: { id: string; rule: string; severity: string; details: string }[] };
}
interface Flag {
  id: string;
  rule: string;
  severity: string;
  details: string;
  status: string;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string };
  entry: { id: string; reference: string; description: string } | null;
}

export default function Risk() {
  const admin = useAdmin();
  const [tab, setTab] = useState<'review' | 'flags'>('review');
  const [flagStatus, setFlagStatus] = useState('OPEN');
  const [action, setAction] = useState<ActionSpec | null>(null);
  const { data: queue, isLoading } = useQuery({ queryKey: ['review-queue'], queryFn: () => api.get<Review[]>('/admin/review-queue'), refetchInterval: 15_000 });
  const { data: flags } = useQuery({ queryKey: ['flags', flagStatus], queryFn: () => api.get<Flag[]>(`/admin/fraud-flags?status=${flagStatus}`) });
  const canAct = can(admin, 'ADMIN', 'COMPLIANCE');
  return (
    <>
      <PageHeader title="Review & fraud" subtitle="Large and suspicious transfers are held here until a compliance decision." />
      <Tabs
        className="mb-5 w-fit"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'review', label: 'Held transfers', count: queue?.length },
          { value: 'flags', label: 'Fraud flags' },
        ]}
      />
      {tab === 'review' ? (
        isLoading ? (
          <Skeleton className="h-60" />
        ) : queue?.length ? (
          <div className="space-y-4">
            {queue.map((r) => (
              <Card key={r.id}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-sans tabular-nums tracking-tight text-2xl font-semibold text-navy-800">{formatMoney(r.amount, r.currency)}</p>
                      <Badge tone="info">{r.kind}</Badge>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-1 text-sm text-navy-600">
                      <Link href={`/users/${r.user.id}`} className="font-semibold hover:underline">
                        {r.user.firstName} {r.user.lastName}
                      </Link>{' '}
                      (KYC L{r.user.kycLevel}) → <span className="font-semibold">{r.recipientName}</span> · {r.recipientAccount} {r.recipientBankName && `· ${r.recipientBankName}`}
                    </p>
                    <p className="text-xs text-navy-400">
                      <Link href={`/transactions/${r.entryId}`} className="font-mono hover:underline">
                        {r.entry.reference}
                      </Link>{' '}
                      · submitted {timeAgo(r.createdAt)} · fee {formatMoney(r.fee, r.currency)}
                    </p>
                    {r.entry.fraudFlags.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {r.entry.fraudFlags.map((f) => (
                          <p key={f.id} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-800">
                            <span className="font-semibold">{f.rule}</span> ({f.severity}) — {f.details}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  {canAct && (
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        onClick={() =>
                          setAction({
                            title: `Approve ${formatMoney(r.amount, r.currency)} transfer`,
                            reasonLabel: 'Approval note',
                            confirmLabel: 'Approve & release',
                            success: 'Transfer approved',
                            run: (note) => api.post(`/admin/transfers/${r.id}/approve`, { note }),
                          })
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() =>
                          setAction({
                            title: 'Reject transfer',
                            description: 'The hold is released back to the customer and they are notified with your reason.',
                            confirmLabel: 'Reject',
                            danger: true,
                            success: 'Transfer rejected',
                            run: (reason) => api.post(`/admin/transfers/${r.id}/reject`, { reason }),
                          })
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="Queue is clear" body="No transfers are waiting for review." />
          </Card>
        )
      ) : (
        <Card>
          <CardHeader
            title="Fraud flags"
            action={<Tabs value={flagStatus} onChange={setFlagStatus} tabs={[{ value: 'OPEN', label: 'Open' }, { value: 'CONFIRMED', label: 'Confirmed' }, { value: 'DISMISSED', label: 'Dismissed' }, { value: 'ALL', label: 'All' }]} />}
          />
          {flags?.length ? (
            <Table head={['Raised', 'Customer', 'Rule', 'Details', 'Severity', 'Status', '']}>
              {flags.map((f) => (
                <tr key={f.id}>
                  <Td className="text-xs">{fmtDateTime(f.createdAt)}</Td>
                  <Td>
                    <Link href={`/users/${f.user.id}`} className="font-semibold hover:underline">
                      {f.user.firstName} {f.user.lastName}
                    </Link>
                  </Td>
                  <Td className="font-mono text-xs">{f.rule}</Td>
                  <Td className="max-w-sm whitespace-normal text-xs">
                    {f.details}
                    {f.entry && (
                      <Link href={`/transactions/${f.entry.id}`} className="ml-1 font-mono underline">
                        {f.entry.reference}
                      </Link>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={f.severity} />
                  </Td>
                  <Td>
                    <StatusBadge status={f.status} />
                  </Td>
                  <Td>
                    {f.status === 'OPEN' && canAct && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setAction({ title: 'Dismiss flag', confirmLabel: 'Dismiss', reasonLabel: 'Note', success: 'Flag dismissed', run: (note) => api.post(`/admin/fraud-flags/${f.id}`, { status: 'DISMISSED', note }) })}>
                          Dismiss
                        </Button>
                        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setAction({ title: 'Confirm fraud', confirmLabel: 'Confirm', danger: true, reasonLabel: 'Note', description: 'Consider suspending the customer and reversing related transactions.', success: 'Flag confirmed', run: (note) => api.post(`/admin/fraud-flags/${f.id}`, { status: 'CONFIRMED', note }) })}>
                          Confirm
                        </Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title="No flags" />
          )}
        </Card>
      )}
      <ActionModal spec={action} onClose={() => setAction(null)} />
    </>
  );
}
