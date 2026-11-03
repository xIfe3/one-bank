'use client';

import { BILL_CATEGORIES, CURRENCY_META, formatMoney } from '@onebank/shared';
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input, KeyValue, PageHeader, Select, Skeleton, cn, newIdempotencyKey } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Droplets, Lightbulb, Phone, Receipt, Tv, Wifi, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useConfirmMoney } from '@/components/confirm-money';
import { TxItem } from '@/components/tx';
import { api, type Account, type Paged, type TxRow } from '@/lib/api';
import { handleError } from '@/lib/form';

const ICONS = { AIRTIME: Phone, DATA: Smartphone, ELECTRICITY: Lightbulb, TV: Tv, INTERNET: Wifi, WATER: Droplets };
const LABELS = { AIRTIME: 'Airtime', DATA: 'Data', ELECTRICITY: 'Electricity', TV: 'TV', INTERNET: 'Internet', WATER: 'Water' };
const ID_LABEL = { AIRTIME: 'Phone number', DATA: 'Phone number', ELECTRICITY: 'Meter number', TV: 'Smartcard / account number', INTERNET: 'Account number', WATER: 'Account number' };

interface Provider {
  id: string;
  name: string;
  category: keyof typeof ICONS;
  currencies: string[];
  logoColor: string;
}

export default function Bills() {
  const qc = useQueryClient();
  const [cat, setCat] = useState<keyof typeof ICONS>('ELECTRICITY');
  const [providerId, setProviderId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customer, setCustomer] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [amount, setAmount] = useState('');
  const [fromId, setFromId] = useState('');
  const [result, setResult] = useState<{ token: string | null; id: string; provider: string; amount: string } | null>(null);
  const { confirm, dialog } = useConfirmMoney();
  const { data: providers } = useQuery({ queryKey: ['providers'], queryFn: () => api.get<Provider[]>('/bills/providers') });
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<{ accounts: Account[] }>('/accounts') });
  const { data: recent } = useQuery({ queryKey: ['transactions', 'bills'], queryFn: () => api.get<Paged<TxRow>>('/transactions?type=BILL&pageSize=6') });
  const list = providers?.filter((p) => p.category === cat) ?? [];
  const provider = providers?.find((p) => p.id === providerId);
  const wallets = accounts?.accounts.filter((a) => a.type === 'CUSTOMER_WALLET' && provider?.currencies.includes(a.currency) && a.status === 'ACTIVE') ?? [];
  const from = wallets.find((w) => w.id === fromId) ?? wallets[0];

  useEffect(() => {
    setProviderId('');
    setCustomer(null);
  }, [cat]);
  useEffect(() => setCustomer(null), [customerId, providerId]);

  const validate = async () => {
    setValidating(true);
    try {
      const r = await api.post<{ customerName: string }>('/bills/validate', { providerId, customerId });
      setCustomer(r.customerName);
    } catch (e) {
      handleError(e);
    } finally {
      setValidating(false);
    }
  };

  const pay = () =>
    confirm({
      title: `Pay ${provider!.name}`,
      summary: [
        ['Biller', provider!.name],
        ['Customer', `${customer} · ${customerId}`],
        ['From', `${from!.name} · ${from!.accountNumber}`],
        ['Amount', formatMoney(amount, from!.currency)],
      ],
      confirmLabel: 'Pay now',
      run: async ({ pin, otp }) => {
        const r = await api.post<{ id: string; token: string | null }>('/bills/pay', { fromAccountId: from!.id, providerId, category: cat, customerId, amount: Number(amount), pin, otp, idempotencyKey: newIdempotencyKey() });
        setResult({ token: r.token, id: r.id, provider: provider!.name, amount: formatMoney(amount, from!.currency) });
        qc.invalidateQueries();
        toast.success('Payment successful');
      },
    });

  return (
    <>
      <PageHeader title="Pay bills" subtitle="Electricity, TV, internet, water, airtime and data — paid instantly." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          {result ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
              <h2 className="mt-4 font-serif text-2xl text-navy-800">{result.amount} paid to {result.provider}</h2>
              {result.token && (
                <div className="mx-auto mt-5 max-w-sm rounded-2xl border border-gold-200 bg-gold-50 p-4">
                  <p className="text-xs uppercase tracking-wider text-navy-500">Your electricity token</p>
                  <p className="mt-1 font-mono text-xl font-semibold text-navy-900">{result.token}</p>
                </div>
              )}
              <div className="mt-6 flex justify-center gap-3">
                <Button variant="outline" onClick={() => api.download('GET', `/transactions/${result.id}/receipt`, undefined, 'OneBank-bill-receipt.pdf')}>
                  Download receipt
                </Button>
                <Button
                  onClick={() => {
                    setResult(null);
                    setAmount('');
                    setCustomerId('');
                  }}
                >
                  Pay another bill
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {BILL_CATEGORIES.map((c) => {
                  const Icon = ICONS[c];
                  return (
                    <button key={c} onClick={() => setCat(c)} className={cn('flex flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-xs font-semibold transition', cat === c ? 'border-gold-500 bg-gold-50 text-navy-900 ring-4 ring-gold-100' : 'border-navy-100 text-navy-600 hover:border-navy-300')}>
                      <Icon className="h-5 w-5" />
                      {LABELS[c]}
                    </button>
                  );
                })}
              </div>
              {!providers ? (
                <Skeleton className="h-20" />
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {list.map((p) => (
                    <button key={p.id} onClick={() => setProviderId(p.id)} className={cn('flex items-center gap-3 rounded-2xl border p-3 text-left', providerId === p.id ? 'border-gold-500 bg-gold-50' : 'border-navy-100 hover:border-navy-300')}>
                      <span className="grid h-10 w-10 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: p.logoColor }}>
                        {p.name.charAt(0)}
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-navy-800">{p.name}</span>
                        <span className="text-xs text-navy-400">{p.currencies.join(' · ')}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {provider && (
                <>
                  <Field label={ID_LABEL[cat]}>
                    <div className="flex gap-2">
                      <Input value={customerId} onChange={(e) => setCustomerId(e.target.value.trim())} placeholder={cat === 'AIRTIME' || cat === 'DATA' ? '08031234567' : '45012345678'} />
                      <Button variant="outline" onClick={validate} loading={validating} disabled={customerId.length < 4}>
                        Verify
                      </Button>
                    </div>
                    {customer && (
                      <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-navy-800">
                        <CheckCircle2 className="h-4 w-4 text-success" /> {customer}
                      </p>
                    )}
                  </Field>
                  {wallets.length === 0 ? (
                    <Alert tone="warning">You need a {provider.currencies.join(' or ')} account to pay {provider.name}.</Alert>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Pay from">
                        <Select value={from?.id} onChange={(e) => setFromId(e.target.value)}>
                          {wallets.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.currency} · {formatMoney(w.availableBalance, w.currency)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Amount">
                        <Input inputMode="decimal" prefix={from ? CURRENCY_META[from.currency as 'USD'].symbol : ''} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" />
                      </Field>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button variant="gold" size="lg" disabled={!customer || !Number(amount) || !from} onClick={pay}>
                      Continue
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent bill payments" />
          {recent?.items.length ? (
            <div className="-mx-2">
              {recent.items.map((t) => (
                <TxItem key={t.rowId} t={t} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Receipt className="h-6 w-6" />} title="No bills paid yet" />
          )}
          <KeyValue className="mt-4" items={[['Fees', 'Free'], ['Speed', 'Instant'], ['Receipts', 'PDF for every payment']]} />
        </Card>
      </div>
      {dialog}
    </>
  );
}
