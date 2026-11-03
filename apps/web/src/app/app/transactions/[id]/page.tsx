'use client';

import { formatMoney } from '@onebank/shared';
import { Button, Card, CardHeader, KeyValue, Skeleton, StatusBadge, cn, entryLabel, fmtDateTime } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Copy, Download, Flag, Repeat } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { TxIcon } from '@/components/tx';
import { api } from '@/lib/api';

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
  valueDate: string;
  createdAt: string;
  failureReason: string | null;
  metadata: { fx?: { rate: string; from: string; to: string; converted: string }; fee?: string; token?: string; senderName?: string; reason?: string };
  legs: { accountId: string; accountName: string; accountNumber: string | null; amount: string; currency: string; balanceAfter: string | null; accountType: string }[];
  pendingLegs: { accountName: string; accountNumber: string | null; amount: string; currency: string; released: boolean }[];
  transfer: { kind: string; status: string; fee: string; amount: string; currency: string; recipientName: string; recipientAccount: string; recipientBankName: string | null; swiftCode: string | null; iban: string | null; purpose: string | null; timeline: { status: string; at: string; note?: string }[]; reviewReason: string | null } | null;
  billPayment: { customerId: string; customerName: string; token: string | null; provider: { name: string } } | null;
  cardTransaction: { merchant: string; category: string; last4: string; brand: string } | null;
  reversalOf: { id: string; reference: string } | null;
  reversedBy: { id: string; reference: string } | null;
}

export default function TransactionDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: t, isLoading } = useQuery({ queryKey: ['transaction', id], queryFn: () => api.get<Detail>(`/transactions/${id}`) });
  if (isLoading || !t) return <Skeleton className="h-[520px]" />;
  const leg = t.legs.find((l) => l.accountType === 'CUSTOMER_WALLET') ?? t.legs[0];
  const pend = t.pendingLegs[0];
  const amount = leg?.amount ?? pend?.amount ?? '0';
  const currency = leg?.currency ?? pend?.currency ?? 'USD';
  const credit = Number(amount) > 0;
  const status = t.transfer?.status ?? t.status;
  const rows: [React.ReactNode, React.ReactNode][] = [
    [
      'Reference',
      <button
        key="r"
        className="inline-flex items-center gap-1.5 font-mono"
        onClick={() => {
          navigator.clipboard.writeText(t.reference);
          toast.success('Reference copied');
        }}
      >
        {t.reference} <Copy className="h-3 w-3 text-navy-400" />
      </button>,
    ],
    ['Type', entryLabel(t.type)],
    ['Date', fmtDateTime(t.valueDate)],
  ];
  if (t.counterpartyName) rows.push([credit ? 'From' : 'To', t.counterpartyName]);
  if (t.counterpartyAccount) rows.push(['Account', t.counterpartyAccount]);
  if (t.counterpartyBank) rows.push(['Bank', t.counterpartyBank]);
  if (t.transfer?.swiftCode) rows.push(['SWIFT / BIC', t.transfer.swiftCode]);
  if (t.transfer?.purpose) rows.push(['Purpose', t.transfer.purpose]);
  if (t.transfer && Number(t.transfer.fee) > 0) rows.push(['Fee', formatMoney(t.transfer.fee, t.transfer.currency)]);
  if (t.metadata.fx) rows.push(['Exchange rate', `1 ${t.metadata.fx.from} = ${Number(t.metadata.fx.rate).toFixed(4)} ${t.metadata.fx.to}`]);
  if (t.billPayment) rows.push(['Customer', `${t.billPayment.customerName} · ${t.billPayment.customerId}`]);
  if (t.billPayment?.token) rows.push(['Token', <span key="tok" className="font-mono text-base text-navy-900">{t.billPayment.token}</span>]);
  if (t.cardTransaction) rows.push(['Card', `${t.cardTransaction.brand} •••• ${t.cardTransaction.last4}`]);
  if (t.category) rows.push(['Category', t.category]);
  if (leg?.accountNumber) rows.push(['Your account', `${leg.accountName} · ${leg.accountNumber}`]);
  if (leg?.balanceAfter) rows.push(['Balance after', formatMoney(leg.balanceAfter, currency)]);
  if (t.failureReason) rows.push(['Reason', <span key="f" className="text-danger">{t.failureReason}</span>]);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/app/transactions" className="mb-4 inline-flex items-center gap-1 text-sm text-navy-500 hover:text-navy-800">
        <ArrowLeft className="h-4 w-4" /> Transactions
      </Link>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="flex flex-col items-center border-b border-navy-50 pb-6 text-center">
            <TxIcon type={t.type} credit={credit} />
            <p className="mt-4 text-sm text-navy-500">{t.description}</p>
            <p className={cn('mt-1 font-sans tabular-nums tracking-tight text-4xl font-semibold', credit ? 'text-success' : 'text-navy-800')}>{formatMoney(amount, currency, { sign: true })}</p>
            <div className="mt-3">
              <StatusBadge status={status} />
            </div>
            {t.reversedBy && (
              <p className="mt-3 text-xs text-navy-500">
                Reversed by{' '}
                <Link href={`/app/transactions/${t.reversedBy.id}`} className="font-semibold underline">
                  {t.reversedBy.reference}
                </Link>
              </p>
            )}
            {t.reversalOf && (
              <p className="mt-3 text-xs text-navy-500">
                Reversal of{' '}
                <Link href={`/app/transactions/${t.reversalOf.id}`} className="font-semibold underline">
                  {t.reversalOf.reference}
                </Link>
              </p>
            )}
          </div>
          <KeyValue className="mt-4" items={rows} />
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="primary" icon={<Download className="h-4 w-4" />} onClick={() => api.download('GET', `/transactions/${t.id}/receipt`, undefined, `OneBank-receipt-${t.reference}.pdf`)}>
              Download receipt
            </Button>
            {!credit && t.transfer?.kind === 'INTERNAL' && (
              <Link href={`/app/transfer?to=${t.transfer.recipientAccount}`}>
                <Button variant="outline" icon={<Repeat className="h-4 w-4" />}>
                  Send again
                </Button>
              </Link>
            )}
            <Link href={`/app/support?new=1&tx=${t.id}&subject=${encodeURIComponent(`Issue with ${t.reference}`)}`}>
              <Button variant="ghost" icon={<Flag className="h-4 w-4" />}>
                Report an issue
              </Button>
            </Link>
          </div>
        </Card>
        {t.transfer?.timeline?.length ? (
          <Card>
            <CardHeader title="Progress" />
            <ol className="relative space-y-6 border-l-2 border-navy-50 pl-6">
              {t.transfer.timeline.map((s, i) => (
                <li key={i} className="relative">
                  <span className={cn('absolute -left-[33px] grid h-6 w-6 place-items-center rounded-full ring-4 ring-white', ['FAILED', 'REJECTED'].includes(s.status) ? 'bg-danger text-white' : 'bg-gold-500 text-navy-900')}>
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <p className="text-sm font-semibold capitalize text-navy-800">{s.status.replace(/_/g, ' ').toLowerCase()}</p>
                  {s.note && <p className="text-xs text-navy-500">{s.note}</p>}
                  <p className="text-xs text-navy-400">{fmtDateTime(s.at)}</p>
                </li>
              ))}
              {['PENDING', 'PROCESSING', 'AWAITING_REVIEW'].includes(t.transfer.status) && (
                <li className="relative">
                  <span className="absolute -left-[33px] h-6 w-6 animate-pulse rounded-full bg-navy-100 ring-4 ring-white" />
                  <p className="text-sm font-semibold text-navy-400">{t.transfer.kind === 'WIRE' ? 'Credited by beneficiary bank' : 'Settled'}</p>
                  <p className="text-xs text-navy-400">In progress…</p>
                </li>
              )}
            </ol>
          </Card>
        ) : (
          <Card className="border-0 bg-navy-deep text-white">
            <p className="font-serif text-lg">Need help with this payment?</p>
            <p className="mt-2 text-sm text-navy-200">Open a ticket and we’ll link it to this transaction automatically, so our team has everything they need.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
