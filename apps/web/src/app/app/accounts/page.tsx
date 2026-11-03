'use client';

import { CURRENCY_META, formatMoney } from '@onebank/shared';
import { Badge, Button, Card, CurrencyFlag, CardHeader, Field, Input, KeyValue, Modal, PageHeader, Select, Skeleton, newIdempotencyKey } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Copy, Download, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AddMoneyModal, OpenAccountModal } from '@/components/actions';
import { useConfirmMoney } from '@/components/confirm-money';
import { api, type Account } from '@/lib/api';
import { handleError } from '@/lib/form';

interface Summary {
  baseCurrency: string;
  totalBalance: string;
  accounts: Account[];
}

function AccountsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<Summary>('/accounts') });
  const params = useSearchParams();
  const [add, setAdd] = useState<string | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [exchange, setExchange] = useState(false);
  const [statement, setStatement] = useState<Account | null>(null);
  useEffect(() => setExchange(params.get('exchange') === '1'), [params]);

  if (isLoading || !data) return <Skeleton className="h-96" />;
  const wallets = data.accounts.filter((a) => a.type === 'CUSTOMER_WALLET');
  const others = data.accounts.filter((a) => a.type !== 'CUSTOMER_WALLET');

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle={`Total ${formatMoney(data.totalBalance, data.baseCurrency)} across all accounts`}
        actions={
          <>
            <Button variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setExchange(true)} disabled={wallets.length < 2}>
              Exchange
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setOpenNew(true)}>
              New currency account
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {wallets.map((a) => (
          <Card key={a.id}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <CurrencyFlag currency={a.currency} size="lg" />
                <div>
                  <p className="font-serif text-lg text-navy-800">{a.name}</p>
                  <p className="text-xs text-navy-400">{CURRENCY_META[a.currency as 'USD'].name}</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                {a.isPrimary && <Badge tone="gold">Primary</Badge>}
                {a.status !== 'ACTIVE' && <Badge tone="info">{a.status}</Badge>}
              </div>
            </div>
            <p className="mt-6 text-xs uppercase tracking-wider text-navy-400">Available</p>
            <p className="font-sans tabular-nums tracking-tight text-3xl font-semibold text-navy-800">{formatMoney(a.availableBalance, a.currency)}</p>
            {a.balance !== a.availableBalance && <p className="text-xs text-navy-400">Ledger balance {formatMoney(a.balance, a.currency)} · pending transfers on hold</p>}
            <KeyValue
              className="mt-4"
              items={[
                [
                  'Account number',
                  <button
                    key="n"
                    onClick={() => {
                      navigator.clipboard.writeText(a.accountNumber ?? '');
                      toast.success('Copied');
                    }}
                    className="inline-flex items-center gap-1.5 font-mono"
                  >
                    {a.accountNumber} <Copy className="h-3 w-3 text-navy-400" />
                  </button>,
                ],
                ['Bank', 'One Bank · ONEBUS33'],
              ]}
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <Button size="sm" variant="gold" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAdd(a.id)}>
                Add money
              </Button>
              <Link href={`/app/transfer?from=${a.id}`}>
                <Button size="sm" variant="secondary" icon={<ArrowLeftRight className="h-3.5 w-3.5" />}>
                  Send
                </Button>
              </Link>
              <Button size="sm" variant="outline" icon={<Download className="h-3.5 w-3.5" />} onClick={() => setStatement(a)}>
                Statement
              </Button>
              <Link href={`/app/transactions?accountId=${a.id}`}>
                <Button size="sm" variant="ghost">
                  History
                </Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>
      {others.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Savings, deposits & cards" />
          <div className="divide-y divide-navy-50">
            {others.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-semibold text-navy-800">{a.name}</p>
                  <p className="text-xs text-navy-400">{a.type.replace('_', ' ').toLowerCase()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-navy-800">{formatMoney(a.balance, a.currency)}</p>
                  <Button size="sm" variant="ghost" onClick={() => setStatement(a)}>
                    Statement
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <AddMoneyModal key={add ?? 'x'} open={!!add} onClose={() => setAdd(null)} accounts={data.accounts} defaultAccountId={add ?? undefined} />
      <OpenAccountModal open={openNew} onClose={() => setOpenNew(false)} existing={wallets.map((w) => w.currency)} />
      <ExchangeModal open={exchange} onClose={() => setExchange(false)} wallets={wallets} />
      <StatementModal account={statement} onClose={() => setStatement(null)} />
    </>
  );
}

interface Quote {
  id: string;
  from: string;
  to: string;
  amount: string;
  rate: string;
  midRate: string;
  converted: string;
  spread: string;
  expiresAt: number;
}

function ExchangeModal({ open, onClose, wallets }: { open: boolean; onClose: () => void; wallets: Account[] }) {
  const [from, setFrom] = useState(wallets[0]?.id ?? '');
  const [to, setTo] = useState(wallets[1]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const { request: pending, confirm, dialog } = useConfirmMoney();
  const fa = wallets.find((w) => w.id === from);
  const ta = wallets.find((w) => w.id === to);
  useEffect(() => {
    if (!quote) return;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((quote.expiresAt - Date.now()) / 1000))), 250);
    return () => clearInterval(t);
  }, [quote]);
  useEffect(() => setQuote(null), [from, to, amount]);

  const getQuote = async () => {
    if (!fa || !ta || !Number(amount)) return;
    setBusy(true);
    try {
      setQuote(await api.post<Quote>('/fx/quote', { from: fa.currency, to: ta.currency, amount: Number(amount) }));
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={open && !pending}
        onClose={onClose}
        title="Exchange currency"
        subtitle="Quotes are locked for 30 seconds."
        footer={
          quote && left > 0 ? (
            <Button
              variant="gold"
              onClick={() =>
                confirm({
                  title: 'Confirm exchange',
                  summary: [
                    ['You sell', formatMoney(quote.amount, quote.from)],
                    ['You get', formatMoney(quote.converted, quote.to)],
                    ['Rate', `1 ${quote.from} = ${Number(quote.rate).toFixed(4)} ${quote.to}`],
                  ],
                  confirmLabel: 'Exchange',
                  run: async ({ pin, otp }) => {
                    await api.post('/fx/exchange', { fromAccountId: from, toAccountId: to, amount: Number(amount), quoteId: quote.id, pin, otp, idempotencyKey: newIdempotencyKey() });
                    toast.success(`Exchanged ${formatMoney(quote.amount, quote.from)} → ${formatMoney(quote.converted, quote.to)}`);
                    qc.invalidateQueries();
                    setQuote(null);
                    setAmount('');
                    onClose();
                  },
                })
              }
            >
              Exchange now ({left}s)
            </Button>
          ) : (
            <Button variant="primary" loading={busy} onClick={getQuote} disabled={!Number(amount) || from === to}>
              Get quote
            </Button>
          )
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <Select value={from} onChange={(e) => setFrom(e.target.value)}>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.currency} · {formatMoney(w.availableBalance, w.currency)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="To">
              <Select value={to} onChange={(e) => setTo(e.target.value)}>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.currency} · {formatMoney(w.availableBalance, w.currency)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Amount" error={from === to ? 'Choose two different accounts' : undefined}>
            <Input inputMode="decimal" prefix={fa ? CURRENCY_META[fa.currency as 'USD'].symbol : ''} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" />
          </Field>
          {quote && (
            <div className="rounded-2xl bg-ivory p-4">
              <p className="text-xs text-navy-400">You’ll receive</p>
              <p className="font-sans tabular-nums tracking-tight text-3xl font-semibold text-navy-800">{formatMoney(quote.converted, quote.to)}</p>
              <p className="mt-2 text-xs text-navy-500">
                Rate 1 {quote.from} = {Number(quote.rate).toFixed(4)} {quote.to} · mid-market {Number(quote.midRate).toFixed(4)} · spread {quote.spread}%
              </p>
              {left === 0 && <p className="mt-2 text-xs font-semibold text-danger">Quote expired — get a new one.</p>}
            </div>
          )}
        </div>
      </Modal>
      {dialog}
    </>
  );
}

function StatementModal({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [from, setFrom] = useState(first.toISOString().slice(0, 10));
  const [to, setTo] = useState(now.toISOString().slice(0, 10));
  const [busy, setBusy] = useState<string | null>(null);
  if (!account) return null;
  const run = async (email: boolean) => {
    setBusy(email ? 'email' : 'pdf');
    try {
      const r = await api.download('POST', '/statements', { accountId: account.id, from, to, email }, `OneBank-statement-${account.accountNumber ?? account.id}.pdf`);
      if (r && (r as { emailed?: boolean }).emailed) toast.success('Statement emailed to you');
      else toast.success('Statement downloaded');
      onClose();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Account statement"
      subtitle={`${account.name}${account.accountNumber ? ` · ${account.accountNumber}` : ''}`}
      footer={
        <>
          <Button variant="outline" loading={busy === 'email'} onClick={() => run(true)}>
            Email it to me
          </Button>
          <Button variant="gold" loading={busy === 'pdf'} icon={<Download className="h-4 w-4" />} onClick={() => run(false)}>
            Download PDF
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ['Last month', new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0)],
          ['Last 3 months', new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()), now],
          ['Year to date', new Date(now.getFullYear(), 0, 1), now],
        ].map(([l, f, t]) => (
          <button
            key={l as string}
            onClick={() => {
              setFrom((f as Date).toISOString().slice(0, 10));
              setTo((t as Date).toISOString().slice(0, 10));
            }}
            className="rounded-full bg-navy-50 px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-100"
          >
            {l as string}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export default function Page() {
  return (
    <Suspense>
      <AccountsPage />
    </Suspense>
  );
}
