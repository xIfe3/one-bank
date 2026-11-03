'use client';

import { CURRENCY_META, calculateFee, formatMoney } from '@onebank/shared';
import { Alert, Avatar, Button, Card, CardHeader, Field, Input, PageHeader, Select, Skeleton, Tabs, Textarea, cn, newIdempotencyKey } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, Globe2, Landmark, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useConfirmMoney } from '@/components/confirm-money';
import { api, type Account } from '@/lib/api';
import { useMe } from '@/lib/session';

type Kind = 'INTERNAL' | 'INTERBANK' | 'WIRE';

interface Beneficiary {
  id: string;
  type: Kind;
  nickname: string | null;
  name: string;
  accountNumber: string;
  bankCode: string | null;
  bankName: string | null;
  swiftCode: string | null;
  country: string | null;
  address: string | null;
}
interface Status {
  fees: Record<string, { flat: number; percent: number; min: number; max: number }>;
  features: Record<string, boolean>;
}

function TransferPage() {
  const me = useMe();
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>((params.get('kind') as Kind) ?? 'INTERNAL');
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<{ accounts: Account[] }>('/accounts') });
  const { data: bens } = useQuery({ queryKey: ['beneficiaries'], queryFn: () => api.get<Beneficiary[]>('/transfers/beneficiaries') });
  const { data: banks } = useQuery({ queryKey: ['banks'], queryFn: () => api.get<{ code: string; name: string; country: string }[]>('/transfers/banks') });
  const { data: status } = useQuery({ queryKey: ['status'], queryFn: () => api.get<Status>('/public/status') });
  const { data: limits } = useQuery({ queryKey: ['limits'], queryFn: () => api.get<{ dailyUsd: number; remainingUsd: number; kycLevel: number }>('/me/limits') });
  const { confirm, dialog } = useConfirmMoney();
  const wallets = useMemo(() => accounts?.accounts.filter((a) => a.type === 'CUSTOMER_WALLET' && a.status === 'ACTIVE') ?? [], [accounts]);

  const [fromId, setFromId] = useState(params.get('from') ?? '');
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [save, setSave] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [when, setWhen] = useState('');
  const [frequency, setFrequency] = useState<'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'>('ONCE');
  // internal
  const [recipient, setRecipient] = useState(params.get('to') ?? '');
  const [lookup, setLookup] = useState<{ name: string; accountNumber: string; currency: string } | null>(null);
  const [lookupErr, setLookupErr] = useState('');
  // interbank
  const [bankCode, setBankCode] = useState('');
  const [acctNo, setAcctNo] = useState('');
  const [acctName, setAcctName] = useState('');
  // wire
  const [wire, setWire] = useState({ beneficiaryName: '', beneficiaryAddress: '', country: 'GB', bankName: '', swiftCode: '', iban: '', purpose: '' });
  const [done, setDone] = useState<{ id: string; status?: string; scheduled?: boolean } | null>(null);

  useEffect(() => {
    if (!fromId && wallets[0]) setFromId(wallets[0].id);
  }, [wallets, fromId]);
  const from = wallets.find((w) => w.id === fromId);

  // Debounced internal lookup
  useEffect(() => {
    setLookup(null);
    setLookupErr('');
    if (kind !== 'INTERNAL' || recipient.trim().length < 3) return;
    const t = setTimeout(() => {
      api
        .get<{ name: string; accountNumber: string; currency: string }>(`/accounts/lookup?recipient=${encodeURIComponent(recipient.trim())}`)
        .then(setLookup)
        .catch((e: Error) => setLookupErr(e.message));
    }, 450);
    return () => clearTimeout(t);
  }, [recipient, kind]);

  // Interbank name enquiry
  useEffect(() => {
    setAcctName('');
    if (kind !== 'INTERBANK' || !bankCode || !/^\d{6,12}$/.test(acctNo)) return;
    const t = setTimeout(() => {
      api
        .get<{ accountName: string }>(`/transfers/name-enquiry?bankCode=${bankCode}&accountNumber=${acctNo}`)
        .then((r) => setAcctName(r.accountName))
        .catch(() => setAcctName(''));
    }, 400);
    return () => clearTimeout(t);
  }, [bankCode, acctNo, kind]);

  if (!accounts || !status) return <Skeleton className="h-[520px]" />;

  const amt = Number(amount) || 0;
  const feeRule = kind === 'INTERBANK' ? status.fees.interbank : kind === 'WIRE' ? status.fees.wire : null;
  // Fee rules are in USD; show an approximate local-currency fee (exact fee confirmed by the API).
  const feeUsd = feeRule ? Number(calculateFee(amt, feeRule)) : 0;
  const disabledFeature = kind === 'INTERNAL' ? !status.features.internalTransfers : kind === 'INTERBANK' ? !status.features.interbank : !status.features.wire;

  const pickBeneficiary = (b: Beneficiary) => {
    setKind(b.type);
    if (b.type === 'INTERNAL') setRecipient(b.accountNumber);
    if (b.type === 'INTERBANK') {
      setBankCode(b.bankCode ?? '');
      setAcctNo(b.accountNumber);
    }
    if (b.type === 'WIRE') setWire({ beneficiaryName: b.name, beneficiaryAddress: b.address ?? '', country: b.country ?? 'GB', bankName: b.bankName ?? '', swiftCode: b.swiftCode ?? '', iban: b.accountNumber, purpose: '' });
  };

  const valid =
    !!from &&
    amt > 0 &&
    !disabledFeature &&
    (kind === 'INTERNAL' ? !!lookup : kind === 'INTERBANK' ? !!acctName : Object.entries(wire).every(([, v]) => v.trim().length > 1)) &&
    (!schedule || !!when || frequency !== 'ONCE');

  const submit = () => {
    if (!from) return;
    const base = { fromAccountId: from.id, amount: amt, saveBeneficiary: save, ...(schedule ? { scheduledFor: when ? new Date(when).toISOString() : undefined, frequency } : {}) };
    const toName = kind === 'INTERNAL' ? lookup!.name : kind === 'INTERBANK' ? acctName : wire.beneficiaryName;
    const summary: [React.ReactNode, React.ReactNode][] = [
      ['From', `${from.name} · ${from.accountNumber}`],
      ['To', toName],
      ['Account', kind === 'INTERNAL' ? `${lookup!.accountNumber} · One Bank` : kind === 'INTERBANK' ? `${acctNo} · ${banks?.find((b) => b.code === bankCode)?.name}` : `${wire.iban} · ${wire.swiftCode}`],
      ['Amount', formatMoney(amt, from.currency)],
    ];
    if (kind === 'INTERNAL' && lookup && lookup.currency !== from.currency) summary.push(['Recipient currency', `${lookup.currency} — converted at today’s rate`]);
    if (feeRule) summary.push(['Fee (approx.)', `$${feeUsd.toFixed(2)} equivalent`]);
    if (schedule) summary.push(['Schedule', `${frequency === 'ONCE' ? 'Once' : frequency.toLowerCase()}${when ? ` from ${new Date(when).toLocaleString()}` : ' starting now'}`]);
    confirm({
      title: schedule ? 'Schedule transfer' : 'Confirm transfer',
      summary,
      confirmLabel: schedule ? 'Schedule' : `Send ${formatMoney(amt, from.currency)}`,
      run: async ({ pin, otp }) => {
        const auth = { pin, otp, idempotencyKey: newIdempotencyKey() };
        let r: { id?: string; status?: string; scheduled?: boolean };
        if (kind === 'INTERNAL') r = await api.post('/transfers/internal', { ...base, ...auth, recipient: recipient.trim(), narration });
        else if (kind === 'INTERBANK') r = await api.post('/transfers/interbank', { ...base, ...auth, bankCode, accountNumber: acctNo, accountName: acctName, narration });
        else r = await api.post('/transfers/wire', { ...base, ...auth, ...wire });
        qc.invalidateQueries();
        setDone({ id: r.id ?? '', status: r.status, scheduled: r.scheduled });
        toast.success(r.scheduled ? 'Transfer scheduled' : 'Transfer sent');
      },
    });
  };

  if (done)
    return (
      <Card className="mx-auto max-w-lg text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
        <h1 className="mt-4 font-display text-2xl text-navy-800">{done.scheduled ? 'Transfer scheduled' : done.status === 'AWAITING_REVIEW' ? 'Transfer under review' : done.status === 'PENDING' ? 'Transfer on its way' : 'Money sent'}</h1>
        <p className="mt-2 text-navy-500">
          {done.scheduled
            ? 'We will send it automatically and notify you each time.'
            : done.status === 'AWAITING_REVIEW'
              ? 'For your security, our team is reviewing this payment. Funds are on hold and we will notify you shortly.'
              : done.status === 'PENDING'
                ? 'We will notify you as soon as it is credited.'
                : 'The recipient has been credited instantly.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {done.id && (
            <Button variant="outline" onClick={() => router.push(`/app/transactions/${done.id}`)}>
              View receipt
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => {
              setDone(null);
              setAmount('');
              setNarration('');
            }}
          >
            New transfer
          </Button>
        </div>
      </Card>
    );

  return (
    <>
      <PageHeader
        title="Send money"
        subtitle={limits ? `Daily limit remaining: $${limits.remainingUsd.toLocaleString()} of $${limits.dailyUsd.toLocaleString()} (USD equivalent)` : undefined}
        actions={
          <Link href="/app/transfer/scheduled">
            <Button variant="outline" icon={<CalendarClock className="h-4 w-4" />}>
              Scheduled
            </Button>
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <Tabs<Kind>
            value={kind}
            onChange={setKind}
            tabs={[
              { value: 'INTERNAL', label: 'One Bank member' },
              { value: 'INTERBANK', label: 'Other bank' },
              { value: 'WIRE', label: 'International wire' },
            ]}
          />
          <div className="mt-6 space-y-5">
            {disabledFeature && <Alert tone="warning">This service is temporarily unavailable. Please try again later.</Alert>}
            {kind === 'WIRE' && me.kycLevel < 2 && (
              <Alert tone="info" title="Verification required" action={<Link href="/app/settings/kyc"><Button size="sm">Verify now</Button></Link>}>
                International wires require identity verification (level 2).
              </Alert>
            )}
            <Field label="From account">
              <Select value={fromId} onChange={(e) => setFromId(e.target.value)}>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} · {formatMoney(w.availableBalance, w.currency)} available
                  </option>
                ))}
              </Select>
            </Field>

            {kind === 'INTERNAL' && (
              <Field label="Recipient" hint="Account number or @tag" error={lookupErr || undefined}>
                <Input prefix={<Search className="h-4 w-4" />} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="@alex or 2012345678" />
                {lookup && (
                  <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-3 py-2">
                    <Avatar name={lookup.name} className="h-8 w-8" />
                    <div className="text-sm">
                      <p className="font-semibold text-navy-800">{lookup.name}</p>
                      <p className="text-xs text-navy-500">
                        {lookup.accountNumber} · {lookup.currency} account
                      </p>
                    </div>
                    <CheckCircle2 className="ml-auto h-5 w-5 text-success" />
                  </div>
                )}
              </Field>
            )}

            {kind === 'INTERBANK' && (
              <>
                <Field label="Bank">
                  <Select value={bankCode} onChange={(e) => setBankCode(e.target.value)}>
                    <option value="">Select a bank</option>
                    {banks?.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name} ({b.country})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Account number" hint={acctName ? undefined : 'We’ll look up the account name automatically.'}>
                  <Input inputMode="numeric" value={acctNo} onChange={(e) => setAcctNo(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="0123456789" />
                  {acctName && (
                    <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-navy-800">
                      <CheckCircle2 className="h-4 w-4 text-success" /> {acctName}
                    </p>
                  )}
                </Field>
              </>
            )}

            {kind === 'WIRE' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {(
                  [
                    ['beneficiaryName', 'Beneficiary name'],
                    ['bankName', 'Bank name'],
                    ['iban', 'IBAN / account number'],
                    ['swiftCode', 'SWIFT / BIC'],
                    ['beneficiaryAddress', 'Beneficiary address'],
                    ['purpose', 'Purpose of payment'],
                  ] as const
                ).map(([k, l]) => (
                  <Field key={k} label={l} className={k === 'beneficiaryAddress' || k === 'purpose' ? 'sm:col-span-2' : ''}>
                    <Input value={wire[k]} onChange={(e) => setWire({ ...wire, [k]: k === 'swiftCode' || k === 'iban' ? e.target.value.toUpperCase().replace(/\s/g, '') : e.target.value })} />
                  </Field>
                ))}
                <Field label="Country">
                  <Select value={wire.country} onChange={(e) => setWire({ ...wire, country: e.target.value })}>
                    {['GB', 'DE', 'FR', 'NL', 'ES', 'IT', 'IE', 'US', 'CA', 'NG', 'GH', 'KE', 'ZA', 'AE'].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}

            <Field label="Amount">
              <Input inputMode="decimal" className="text-lg font-semibold" prefix={from ? CURRENCY_META[from.currency as 'USD'].symbol : ''} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" />
              {from && amt > Number(from.availableBalance) && <p className="text-xs font-medium text-danger">Exceeds your available balance.</p>}
            </Field>
            {kind !== 'WIRE' && (
              <Field label="Description (optional)">
                <Textarea rows={2} maxLength={140} value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="What’s it for?" />
              </Field>
            )}
            <div className="space-y-3 rounded-2xl bg-ivory p-4">
              <label className="flex items-center gap-2 text-sm text-navy-700">
                <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="h-4 w-4 accent-[#0B1B3F]" /> Save as beneficiary
              </label>
              {kind !== 'WIRE' && (
                <label className="flex items-center gap-2 text-sm text-navy-700">
                  <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} className="h-4 w-4 accent-[#0B1B3F]" /> Schedule for later or repeat
                </label>
              )}
              {schedule && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Start date & time">
                    <Input type="datetime-local" value={when} min={new Date().toISOString().slice(0, 16)} onChange={(e) => setWhen(e.target.value)} />
                  </Field>
                  <Field label="Repeat">
                    <Select value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}>
                      <option value="ONCE">Don’t repeat</option>
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="MONTHLY">Monthly</option>
                    </Select>
                  </Field>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-navy-50 pt-5">
              <div className="text-sm text-navy-500">
                {feeRule ? (
                  <>
                    Fee approx. <span className="font-semibold text-navy-800">${feeUsd.toFixed(2)}</span> (USD equiv.)
                  </>
                ) : (
                  <span className="font-semibold text-success">No fee · instant</span>
                )}
              </div>
              <Button variant="gold" size="lg" disabled={!valid} onClick={submit}>
                Continue
              </Button>
            </div>
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Beneficiaries" action={<Link href="/app/beneficiaries" className="text-sm font-semibold text-navy-600">Manage</Link>} />
            {bens?.length ? (
              <div className="-mx-2 space-y-1">
                {bens.slice(0, 8).map((b) => (
                  <button key={b.id} onClick={() => pickBeneficiary(b)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-ivory">
                    <Avatar name={b.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy-800">{b.nickname ?? b.name}</p>
                      <p className="truncate text-xs text-navy-400">
                        {b.bankName ?? 'One Bank'} · {b.accountNumber}
                      </p>
                    </div>
                    {b.type === 'WIRE' ? <Globe2 className="h-4 w-4 text-navy-300" /> : b.type === 'INTERBANK' ? <Landmark className="h-4 w-4 text-navy-300" /> : <Users className="h-4 w-4 text-navy-300" />}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-navy-400">Saved recipients appear here.</p>
            )}
          </Card>
          <Card className={cn('border-0 bg-navy-deep text-white')}>
            <p className="font-serif text-lg">Transfer times</p>
            <ul className="mt-3 space-y-2 text-sm text-navy-200">
              <li>• One Bank members — instant, free</li>
              <li>• Other banks — usually within minutes</li>
              <li>• International wires — within hours</li>
              <li>• Large payments may be reviewed for your security</li>
            </ul>
          </Card>
        </div>
      </div>
      {dialog}
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <TransferPage />
    </Suspense>
  );
}
