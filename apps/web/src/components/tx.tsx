'use client';

import { Money, StatusBadge, cn, entryLabel, fmtDate } from '@onebank/ui';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Gift,
  Globe2,
  Landmark,
  PiggyBank,
  Receipt,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import type { TxRow } from '@/lib/api';

const ICONS: Record<string, typeof ArrowUpRight> = {
  DEPOSIT: ArrowDownLeft,
  INTERNAL_TRANSFER: ArrowLeftRight,
  INTERBANK: Landmark,
  WIRE: Globe2,
  BILL: Receipt,
  CARD_FUNDING: CreditCard,
  CARD_WITHDRAWAL: CreditCard,
  CARD_SPEND: CreditCard,
  FX: ArrowLeftRight,
  FEE: Banknote,
  ADMIN_CREDIT: Sparkles,
  ADMIN_DEBIT: Banknote,
  REVERSAL: RotateCcw,
  INTEREST: PiggyBank,
  SAVINGS_TRANSFER: PiggyBank,
  LOAN_DISBURSE: Landmark,
  LOAN_REPAY: Landmark,
  REFERRAL_BONUS: Gift,
};

export function TxIcon({ type, credit }: { type: string; credit: boolean }) {
  const Icon = ICONS[type] ?? (credit ? ArrowDownLeft : ArrowUpRight);
  return (
    <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', credit ? 'bg-emerald-50 text-success' : 'bg-navy-50 text-navy-600')}>
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

export function TxItem({ t, showAccount }: { t: TxRow; showAccount?: boolean }) {
  const credit = Number(t.amount) > 0;
  return (
    <Link href={`/app/transactions/${t.id}`} className="flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-ivory sm:gap-4">
      <TxIcon type={t.type} credit={credit} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-navy-800">{t.counterparty && !t.description.includes(t.counterparty) ? `${t.description}` : t.description}</p>
        <p className="truncate text-xs text-navy-400">
          {entryLabel(t.type)} · {fmtDate(t.valueDate)}
          {showAccount && ` · ${t.accountName}`}
        </p>
      </div>
      <div className="text-right">
        <Money amount={t.amount} currency={t.currency} sign className={cn('text-sm font-semibold', t.status === 'FAILED' && 'text-navy-300 line-through')} />
        {t.status !== 'COMPLETED' && (
          <div className="mt-0.5">
            <StatusBadge status={t.status} />
          </div>
        )}
      </div>
    </Link>
  );
}
