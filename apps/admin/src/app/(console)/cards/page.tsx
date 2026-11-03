'use client';

import { formatMoney } from '@onebank/shared';
import { Button, Card, Field, Input, Modal, PageHeader, Pagination, Select, Skeleton, StatusBadge, Table, Td, fmtDate, fmtDateTime, qs } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ActionModal, type ActionSpec } from '@/components/action-modal';
import { api, can, useAdmin, type Paged } from '@/lib/api';

interface C {
  id: string;
  brand: string;
  label: string;
  last4: string;
  nameOnCard: string;
  currency: string;
  status: string;
  statusReason: string | null;
  spendLimit: string;
  balance?: string;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string };
}

function CardsPage() {
  const admin = useAdmin();
  const qc = useQueryClient();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [dq, setDq] = useState(q);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<ActionSpec | null>(null);
  const [txFor, setTxFor] = useState<C | null>(null);
  const [sim, setSim] = useState<C | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 350);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isLoading } = useQuery({ queryKey: ['admin-cards', dq, status, page], queryFn: () => api.get<Paged<C>>(`/admin/cards${qs({ q: dq, status, page })}`) });
  const { data: txs } = useQuery({ queryKey: ['admin-card-tx', txFor?.id], queryFn: () => api.get<{ id: string; merchant: string; amount: string; currency: string; status: string; declineReason: string | null; createdAt: string }[]>(`/admin/cards/${txFor!.id}/transactions`), enabled: !!txFor });
  const act = (c: C, a: 'freeze' | 'unfreeze' | 'terminate') =>
    setAction({
      title: `${a.charAt(0).toUpperCase() + a.slice(1)} ${c.brand} •••• ${c.last4}`,
      description: a === 'terminate' ? 'Permanent. Remaining balance is returned to the customer’s wallet.' : undefined,
      danger: a !== 'unfreeze',
      confirmLabel: a.charAt(0).toUpperCase() + a.slice(1),
      success: 'Card updated',
      run: (reason) => api.post(`/admin/cards/${c.id}/status`, { action: a, reason }),
    });
  return (
    <>
      <PageHeader title="Cards" subtitle={data ? `${data.total} virtual cards` : undefined} />
      <Card className="mb-4" padded={false}>
        <div className="grid gap-3 p-4 sm:grid-cols-[1fr_180px]">
          <Input prefix={<Search className="h-4 w-4" />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Last 4, name on card or email" />
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="">Any status</option>
            {['ACTIVE', 'FROZEN', 'TERMINATED'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
      </Card>
      <Card>
        {isLoading ? (
          <Skeleton className="h-80" />
        ) : (
          <>
            <Table head={['Card', 'Customer', 'Balance', 'Limit', 'Status', 'Issued', '']}>
              {data?.items.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <p className="font-semibold text-navy-800">
                      {c.brand} •••• {c.last4}
                    </p>
                    <p className="text-xs text-navy-400">{c.label}</p>
                  </Td>
                  <Td>
                    <Link href={`/users/${c.user.id}`} className="hover:underline">
                      {c.user.firstName} {c.user.lastName}
                    </Link>
                  </Td>
                  <Td>{c.balance ? formatMoney(c.balance, c.currency) : '—'}</Td>
                  <Td>{Number(c.spendLimit) ? formatMoney(c.spendLimit, c.currency) : '—'}</Td>
                  <Td>
                    <StatusBadge status={c.status} />
                    {c.statusReason && <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-navy-400">{c.statusReason}</p>}
                  </Td>
                  <Td className="text-xs">{fmtDate(c.createdAt)}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setTxFor(c)}>
                        Activity
                      </Button>
                      {c.status !== 'TERMINATED' && can(admin, 'ADMIN', 'COMPLIANCE') && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => act(c, c.status === 'FROZEN' ? 'unfreeze' : 'freeze')}>
                            {c.status === 'FROZEN' ? 'Unfreeze' : 'Freeze'}
                          </Button>
                          <Button size="sm" variant="ghost" className="text-danger" onClick={() => act(c, 'terminate')}>
                            Terminate
                          </Button>
                        </>
                      )}
                      {c.status !== 'TERMINATED' && can(admin, 'ADMIN') && (
                        <Button size="sm" variant="ghost" onClick={() => setSim(c)}>
                          Post purchase
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            {data && <Pagination page={data.page} pages={data.pages} onChange={setPage} />}
          </>
        )}
      </Card>
      <ActionModal spec={action} onClose={() => setAction(null)} />
      {txFor && (
        <Modal open onClose={() => setTxFor(null)} title={`${txFor.brand} •••• ${txFor.last4} activity`} size="lg">
          <Table head={['Time', 'Merchant', 'Amount', 'Result']}>
            {txs?.map((t) => (
              <tr key={t.id}>
                <Td className="text-xs">{fmtDateTime(t.createdAt)}</Td>
                <Td>{t.merchant}</Td>
                <Td>{formatMoney(t.amount, t.currency)}</Td>
                <Td>
                  <StatusBadge status={t.status} /> {t.declineReason && <span className="text-xs text-navy-400">{t.declineReason}</span>}
                </Td>
              </tr>
            ))}
          </Table>
        </Modal>
      )}
      {sim && <SimModal card={sim} onClose={() => setSim(null)} onDone={() => qc.invalidateQueries()} />}
    </>
  );
}

function SimModal({ card, onClose, onDone }: { card: C; onClose: () => void; onDone: () => void }) {
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Post a card purchase"
      subtitle="Runs a manual merchant authorisation against the card balance and limits (e.g. for corrections or testing)."
      footer={
        <Button
          loading={busy}
          disabled={merchant.length < 2 || !Number(amount)}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api.post<{ approved: boolean; reason?: string }>(`/admin/cards/${card.id}/simulate-purchase`, { merchant, amount: Number(amount) });
              if (r.approved) toast.success('Purchase approved');
              else toast.error(`Declined: ${r.reason}`);
              onDone();
              onClose();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Authorise
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Merchant">
          <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} />
        </Field>
        <Field label={`Amount (${card.currency})`}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
      </div>
    </Modal>
  );
}

export default function Page() {
  return (
    <Suspense>
      <CardsPage />
    </Suspense>
  );
}
