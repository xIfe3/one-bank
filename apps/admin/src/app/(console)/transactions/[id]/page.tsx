'use client';

import { formatMoney } from '@onebank/shared';
import { Alert, Badge, Button, Card, CardHeader, KeyValue, Skeleton, StatusBadge, Switch, Table, Td, entryLabel, fmtDateTime } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { ActionModal, type ActionSpec } from '@/components/action-modal';
import { api, can, useAdmin } from '@/lib/api';

interface Detail {
  id: string;
  reference: string;
  type: string;
  status: string;
  description: string;
  category: string | null;
  counterpartyName: string | null;
  counterpartyAccount: string | null;
  counterpartyBank: string | null;
  initiatorType: string;
  initiatorId: string | null;
  valueDate: string;
  createdAt: string;
  failureReason: string | null;
  metadata: Record<string, unknown>;
  legs: { accountId: string; accountName: string; accountNumber: string | null; accountType: string; systemCode: string | null; amount: string; currency: string; balanceAfter: string | null }[];
  pendingLegs: { accountName: string; amount: string; currency: string; released: boolean }[];
  transfer: { id: string; status: string; kind: string; timeline: { status: string; at: string; note?: string }[] } | null;
  reversalOf: { id: string; reference: string } | null;
  reversedBy: { id: string; reference: string } | null;
  flags: { id: string; rule: string; severity: string; details: string; status: string }[];
  audit: { id: string; actorEmail: string | null; action: string; reason: string | null; createdAt: string }[];
}

export default function TxDetail() {
  const { id } = useParams<{ id: string }>();
  const admin = useAdmin();
  const { data: t, isLoading } = useQuery({ queryKey: ['admin-tx', id], queryFn: () => api.get<Detail>(`/admin/transactions/${id}`) });
  const [action, setAction] = useState<ActionSpec | null>(null);
  const forceRef = useRef(false);
  if (isLoading || !t) return <Skeleton className="h-96" />;
  const isTransfer = !!t.transfer;
  return (
    <>
      <Link href="/transactions" className="mb-4 inline-flex items-center gap-1 text-sm text-navy-500 hover:text-navy-800">
        <ArrowLeft className="h-4 w-4" /> Transactions
      </Link>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs text-navy-400">{t.reference}</p>
                <h1 className="font-display text-2xl text-navy-800">{t.description}</h1>
                <p className="text-sm text-navy-500">
                  {entryLabel(t.type)} · {fmtDateTime(t.valueDate)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={t.transfer?.status ?? t.status} />
                <Badge tone="gold">{t.initiatorType}</Badge>
              </div>
            </div>
            {t.reversedBy && (
              <Alert tone="info" className="mt-4">
                Reversed by{' '}
                <Link href={`/transactions/${t.reversedBy.id}`} className="font-semibold underline">
                  {t.reversedBy.reference}
                </Link>
              </Alert>
            )}
            {t.reversalOf && (
              <Alert tone="info" className="mt-4">
                Reversal of{' '}
                <Link href={`/transactions/${t.reversalOf.id}`} className="font-semibold underline">
                  {t.reversalOf.reference}
                </Link>
              </Alert>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => api.open(`/admin/transactions/${t.id}/receipt`)}>
                Receipt
              </Button>
              {can(admin, 'ADMIN') && t.status === 'COMPLETED' && t.type !== 'REVERSAL' && (
                <Button
                  size="sm"
                  variant="danger"
                  icon={<RotateCcw className="h-4 w-4" />}
                  onClick={() => {
                    forceRef.current = false;
                    setAction({
                      title: 'Reverse transaction',
                      description: 'Posts an equal and opposite entry. The original stays in the ledger marked as reversed. The customer is notified.',
                      extra: <ForceToggle onChange={(v) => (forceRef.current = v)} />,
                      confirmLabel: 'Reverse',
                      danger: true,
                      success: 'Transaction reversed',
                      run: (reason) => api.post(`/admin/transactions/${t.id}/reverse`, { reason, force: forceRef.current }),
                    });
                  }}
                >
                  Reverse
                </Button>
              )}
              {can(admin, 'ADMIN') && t.status === 'PENDING' && !isTransfer && (
                <>
                  <Button size="sm" onClick={() => setAction({ title: 'Settle pending entry', confirmLabel: 'Settle', success: 'Settled', run: (reason) => api.post(`/admin/transactions/${t.id}/pending`, { action: 'settle', reason }) })}>
                    Settle
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAction({ title: 'Fail pending entry', confirmLabel: 'Fail & release hold', danger: true, success: 'Hold released', run: (reason) => api.post(`/admin/transactions/${t.id}/pending`, { action: 'fail', reason }) })}>
                    Fail
                  </Button>
                </>
              )}
              {isTransfer && ['PENDING', 'PROCESSING', 'AWAITING_REVIEW'].includes(t.transfer!.status) && (
                <Link href="/risk">
                  <Button size="sm" variant="outline">
                    Open review queue
                  </Button>
                </Link>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Ledger postings" subtitle="Double-entry: postings sum to zero per currency." />
            <Table head={['Account', 'Type', 'Amount', 'Balance after']}>
              {t.legs.map((l, i) => (
                <tr key={i}>
                  <Td>
                    <p className="font-semibold text-navy-800">{l.accountName}</p>
                    <p className="text-xs text-navy-400">{l.accountNumber ?? l.systemCode}</p>
                  </Td>
                  <Td className="text-xs">{l.accountType}</Td>
                  <Td className={Number(l.amount) > 0 ? 'font-semibold text-success' : 'font-semibold text-danger'}>{formatMoney(l.amount, l.currency, { sign: true })}</Td>
                  <Td>{l.balanceAfter ? formatMoney(l.balanceAfter, l.currency) : '—'}</Td>
                </tr>
              ))}
              {t.pendingLegs.map((l, i) => (
                <tr key={`h${i}`}>
                  <Td>{l.accountName}</Td>
                  <Td className="text-xs">HOLD</Td>
                  <Td className="font-semibold text-warning">{formatMoney(l.amount, l.currency)}</Td>
                  <Td>{l.released ? 'released' : 'on hold'}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <KeyValue
              items={[
                ['Counterparty', t.counterpartyName ?? '—'],
                ['Counterparty account', t.counterpartyAccount ?? '—'],
                ['Counterparty bank', t.counterpartyBank ?? '—'],
                ['Category', t.category ?? '—'],
                ['Created', fmtDateTime(t.createdAt)],
                ['Failure', t.failureReason ?? '—'],
              ]}
            />
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-navy-500">Metadata</summary>
              <pre className="mt-2 overflow-x-auto rounded-xl bg-navy-950 p-3 text-[11px] text-gold-200">{JSON.stringify(t.metadata, null, 2)}</pre>
            </details>
          </Card>
          {t.transfer && (
            <Card>
              <CardHeader title="Transfer timeline" />
              {t.transfer.timeline.map((s, i) => (
                <div key={i} className="border-l-2 border-gold-400 py-1.5 pl-3 text-sm">
                  <p className="font-semibold text-navy-800">{s.status}</p>
                  <p className="text-xs text-navy-400">
                    {fmtDateTime(s.at)} {s.note && `· ${s.note}`}
                  </p>
                </div>
              ))}
            </Card>
          )}
          {t.flags.length > 0 && (
            <Card>
              <CardHeader title="Fraud flags" />
              {t.flags.map((f) => (
                <div key={f.id} className="mb-2 rounded-xl bg-red-50 p-3 text-sm">
                  <p className="font-semibold text-red-800">
                    {f.rule} · {f.severity}
                  </p>
                  <p className="text-xs text-red-700">{f.details}</p>
                </div>
              ))}
            </Card>
          )}
          {t.audit.length > 0 && (
            <Card>
              <CardHeader title="Audit" />
              {t.audit.map((a) => (
                <p key={a.id} className="border-b border-navy-50 py-2 text-xs text-navy-600 last:border-0">
                  <span className="font-mono">{a.action}</span> by {a.actorEmail} · {fmtDateTime(a.createdAt)}
                  {a.reason && ` — ${a.reason}`}
                </p>
              ))}
            </Card>
          )}
        </div>
      </div>
      <ActionModal spec={action} onClose={() => setAction(null)} />
    </>
  );
}

function ForceToggle({ onChange }: { onChange: (v: boolean) => void }) {
  const [on, setOn] = useState(false);
  return (
    <label className="mb-4 flex items-center gap-3 text-sm text-navy-700">
      <Switch
        checked={on}
        onChange={(v) => {
          setOn(v);
          onChange(v);
        }}
        label="Force"
      />{' '}
      Allow customer balance to go negative (force)
    </label>
  );
}
