'use client';

import { formatMoney } from '@onebank/shared';
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input, KeyValue, Modal, PageHeader, Select, Skeleton, StatusBadge, Table, Td, Textarea, fmtDate, newIdempotencyKey } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useConfirmMoney } from '@/components/confirm-money';
import { api, type Account } from '@/lib/api';
import { handleError } from '@/lib/form';
import { useMe } from '@/lib/session';

interface Product {
  id: string;
  name: string;
  description: string;
  currency: string;
  minAmount: string;
  maxAmount: string;
  interestRate: string;
  minTenorMonths: number;
  maxTenorMonths: number;
  minKycLevel: number;
}
interface Loan {
  id: string;
  product: Product;
  principal: string;
  interestRate: string;
  tenorMonths: number;
  totalRepayable: string;
  amountRepaid: string;
  outstanding: string;
  currency: string;
  purpose: string;
  status: string;
  decisionNote: string | null;
  createdAt: string;
  disbursedAt: string | null;
  repayments: { id: string; dueDate: string; amountDue: string; amountPaid: string; lateFee: string; status: string }[];
}

export default function Loans() {
  const me = useMe();
  const { data: loans, isLoading } = useQuery({ queryKey: ['loans'], queryFn: () => api.get<Loan[]>('/loans') });
  const { data: products } = useQuery({ queryKey: ['loan-products'], queryFn: () => api.get<Product[]>('/loans/products') });
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<{ accounts: Account[] }>('/accounts') });
  const [apply, setApply] = useState<Product | null>(null);
  const [repay, setRepay] = useState<Loan | null>(null);
  const wallets = accounts?.accounts.filter((a) => a.type === 'CUSTOMER_WALLET' && a.status === 'ACTIVE') ?? [];
  const activeLoan = loans?.find((l) => ['APPLIED', 'APPROVED', 'DISBURSED', 'DEFAULTED'].includes(l.status));

  if (isLoading) return <Skeleton className="h-96" />;
  return (
    <>
      <PageHeader title="Loans" subtitle="Fixed rates, clear schedules, no early repayment fees." />
      {me.kycLevel < 2 && (
        <Alert tone="info" className="mb-6" title="Verify your identity to apply" action={<Link href="/app/settings/kyc"><Button size="sm">Verify now</Button></Link>}>
          Loans are available to customers at verification level 2 or higher.
        </Alert>
      )}
      {loans?.map((l) => {
        const pct = (Number(l.amountRepaid) / Number(l.totalRepayable)) * 100;
        const next = l.repayments.find((r) => r.status === 'DUE' || r.status === 'LATE');
        return (
          <Card key={l.id} className="mb-6">
            <CardHeader title={`${l.product.name} · ${formatMoney(l.principal, l.currency)}`} subtitle={`${l.tenorMonths} months @ ${Number(l.interestRate)}% p.a. · applied ${fmtDate(l.createdAt)}`} action={<StatusBadge status={l.status} />} />
            {l.status === 'APPLIED' && <Alert tone="info">Your application is being reviewed. We’ll notify you as soon as there’s a decision.</Alert>}
            {l.status === 'REJECTED' && <Alert tone="danger">Not approved{l.decisionNote ? `: ${l.decisionNote}` : '.'}</Alert>}
            {['DISBURSED', 'DEFAULTED', 'REPAID'].includes(l.status) && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-navy-400">Repaid</p>
                    <p className="font-sans tabular-nums tracking-tight text-2xl font-semibold text-navy-800">{formatMoney(l.amountRepaid, l.currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-navy-400">Outstanding</p>
                    <p className="font-sans tabular-nums tracking-tight text-2xl font-semibold text-navy-800">{formatMoney(l.outstanding, l.currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-navy-400">Next payment</p>
                    <p className="font-sans tabular-nums tracking-tight text-2xl font-semibold text-navy-800">{next ? formatMoney(Number(next.amountDue) + Number(next.lateFee) - Number(next.amountPaid), l.currency) : '—'}</p>
                    {next && <p className="text-xs text-navy-400">due {fmtDate(next.dueDate)}</p>}
                  </div>
                </div>
                <div className="mt-4 h-2.5 rounded-full bg-navy-50">
                  <div className="h-2.5 rounded-full bg-gold-sheen" style={{ width: `${pct}%` }} />
                </div>
                {l.status !== 'REPAID' && (
                  <div className="mt-4 flex gap-2">
                    <Button variant="gold" onClick={() => setRepay(l)}>
                      Make a repayment
                    </Button>
                  </div>
                )}
                <details className="mt-5">
                  <summary className="cursor-pointer text-sm font-semibold text-navy-700">Repayment schedule</summary>
                  <Table className="mt-3" head={['#', 'Due', 'Amount', 'Paid', 'Late fee', 'Status']}>
                    {l.repayments.map((r, i) => (
                      <tr key={r.id}>
                        <Td>{i + 1}</Td>
                        <Td>{fmtDate(r.dueDate)}</Td>
                        <Td>{formatMoney(r.amountDue, l.currency)}</Td>
                        <Td>{formatMoney(r.amountPaid, l.currency)}</Td>
                        <Td>{Number(r.lateFee) ? formatMoney(r.lateFee, l.currency) : '—'}</Td>
                        <Td>
                          <StatusBadge status={r.status} />
                        </Td>
                      </tr>
                    ))}
                  </Table>
                </details>
              </>
            )}
          </Card>
        );
      })}
      <h2 className="mb-3 font-serif text-lg text-navy-800">Loan products</h2>
      {products?.length ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {products.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-serif text-xl text-navy-800">{p.name}</p>
                  <p className="mt-1 text-sm text-navy-500">{p.description}</p>
                </div>
                <span className="rounded-full bg-gold-50 px-3 py-1 text-sm font-bold text-gold-700">{Number(p.interestRate)}% p.a.</span>
              </div>
              <KeyValue
                className="mt-4"
                items={[
                  ['Amount', `${formatMoney(p.minAmount, p.currency)} – ${formatMoney(p.maxAmount, p.currency)}`],
                  ['Term', `${p.minTenorMonths}–${p.maxTenorMonths} months`],
                ]}
              />
              <Button className="mt-4" variant="primary" disabled={!!activeLoan || me.kycLevel < p.minKycLevel || me.status !== 'ACTIVE'} onClick={() => setApply(p)}>
                {activeLoan ? 'You have an active loan' : 'Apply'}
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Landmark className="h-6 w-6" />} title="No loan products available" />
      )}
      {apply && <ApplyModal product={apply} wallets={wallets.filter((w) => w.currency === apply.currency)} onClose={() => setApply(null)} />}
      {repay && <RepayModal loan={repay} wallets={wallets.filter((w) => w.currency === repay.currency)} onClose={() => setRepay(null)} />}
    </>
  );
}

function ApplyModal({ product, wallets, onClose }: { product: Product; wallets: Account[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(Math.round((Number(product.minAmount) + Number(product.maxAmount)) / 4)));
  const [months, setMonths] = useState(String(Math.min(12, product.maxTenorMonths)));
  const [accountId, setAccountId] = useState(wallets[0]?.id ?? '');
  const [purpose, setPurpose] = useState('');
  const [quote, setQuote] = useState<{ instalment: string; totalRepayable: string; totalInterest: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!Number(amount) || !Number(months)) return;
    const t = setTimeout(() => api.get<typeof quote>(`/loans/quote?rate=${product.interestRate}&amount=${amount}&months=${months}`).then(setQuote).catch(() => undefined), 300);
    return () => clearTimeout(t);
  }, [amount, months, product.interestRate]);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Apply for ${product.name}`}
      footer={
        <Button
          variant="gold"
          loading={busy}
          disabled={!accountId || purpose.length < 3}
          onClick={async () => {
            setBusy(true);
            try {
              await api.post('/loans', { productId: product.id, accountId, amount: Number(amount), tenorMonths: Number(months), purpose });
              toast.success('Application submitted');
              qc.invalidateQueries({ queryKey: ['loans'] });
              onClose();
            } catch (e) {
              handleError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Submit application
        </Button>
      }
    >
      {wallets.length === 0 ? (
        <Alert tone="warning">Open a {product.currency} account first — loans are paid into it.</Alert>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Amount (${product.currency})`} hint={`${formatMoney(product.minAmount, product.currency)} – ${formatMoney(product.maxAmount, product.currency)}`}>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
            </Field>
            <Field label="Term (months)" hint={`${product.minTenorMonths}–${product.maxTenorMonths}`}>
              <Input inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
          <Field label="Pay into">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} · {w.accountNumber}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="What is the loan for?">
            <Textarea rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </Field>
          {quote && (
            <div className="rounded-2xl bg-navy-deep p-5 text-white">
              <p className="text-xs text-gold-300">Monthly instalment</p>
              <p className="font-sans tabular-nums tracking-tight text-3xl font-semibold">{formatMoney(quote.instalment, product.currency)}</p>
              <p className="mt-2 text-xs text-navy-200">
                Total repayable {formatMoney(quote.totalRepayable, product.currency)} · interest {formatMoney(quote.totalInterest, product.currency)} · {Number(product.interestRate)}% p.a. fixed
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function RepayModal({ loan, wallets, onClose }: { loan: Loan; wallets: Account[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { request, confirm, dialog } = useConfirmMoney();
  const next = loan.repayments.find((r) => r.status === 'DUE' || r.status === 'LATE');
  const [amount, setAmount] = useState(next ? (Number(next.amountDue) + Number(next.lateFee) - Number(next.amountPaid)).toFixed(2) : loan.outstanding);
  const [accountId, setAccountId] = useState(wallets[0]?.id ?? '');
  const acct = wallets.find((w) => w.id === accountId);
  return (
    <>
      <Modal
        open={!request}
        onClose={onClose}
        title="Make a repayment"
        footer={
          <Button
            variant="gold"
            disabled={!acct || !Number(amount)}
            onClick={() =>
              confirm({
                title: 'Confirm repayment',
                summary: [
                  ['Loan', loan.product.name],
                  ['From', `${acct!.name} · ${acct!.accountNumber}`],
                  ['Amount', formatMoney(amount, loan.currency)],
                ],
                run: async ({ pin }) => {
                  const r = await api.post<{ outstanding: string }>(`/loans/${loan.id}/repay`, { accountId, amount: Number(amount), pin, idempotencyKey: newIdempotencyKey() });
                  toast.success(`Repayment received. Outstanding: ${formatMoney(r.outstanding, loan.currency)}`);
                  qc.invalidateQueries();
                  onClose();
                },
              })
            }
          >
            Continue
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            {next && (
              <Button size="sm" variant="secondary" onClick={() => setAmount((Number(next.amountDue) + Number(next.lateFee) - Number(next.amountPaid)).toFixed(2))}>
                Next instalment
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setAmount(loan.outstanding)}>
              Pay off in full ({formatMoney(loan.outstanding, loan.currency)})
            </Button>
          </div>
          <Field label="Amount">
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
          </Field>
          <Field label="From account">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} · {formatMoney(w.availableBalance, w.currency)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
      {dialog}
    </>
  );
}
