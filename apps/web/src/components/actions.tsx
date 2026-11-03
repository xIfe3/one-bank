'use client';

import { CURRENCIES, CURRENCY_META, formatMoney } from '@onebank/shared';
import { Button, CurrencyFlag, Field, Input, Modal, Select, cn, newIdempotencyKey } from '@onebank/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, CreditCard } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, type Account } from '@/lib/api';
import { handleError } from '@/lib/form';
import { useConfirmMoney } from './confirm-money';

export function AddMoneyModal({ open, onClose, accounts, defaultAccountId }: { open: boolean; onClose: () => void; accounts: Account[]; defaultAccountId?: string }) {
  const wallets = accounts.filter((a) => a.type === 'CUSTOMER_WALLET');
  const [accountId, setAccountId] = useState(defaultAccountId ?? wallets[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'CARD' | 'BANK'>('CARD');
  const qc = useQueryClient();
  const { request: pending, confirm, dialog } = useConfirmMoney();
  const acct = wallets.find((w) => w.id === accountId);
  return (
    <>
      <Modal
        open={open && !pending}
        onClose={onClose}
        title="Add money"
        subtitle="Top up from a linked debit card or bank account."
        footer={
          <Button
            variant="gold"
            disabled={!Number(amount) || !acct}
            onClick={() =>
              confirm({
                title: 'Confirm top-up',
                summary: [
                  ['To', `${acct!.name} · ${acct!.accountNumber}`],
                  ['From', method === 'CARD' ? 'Visa debit •••• 4242' : 'Linked bank account'],
                  ['Amount', formatMoney(amount, acct!.currency)],
                ],
                confirmLabel: 'Add money',
                run: async ({ pin, otp }) => {
                  await api.post('/accounts/deposit', { accountId, amount: Number(amount), method, pin, otp, idempotencyKey: newIdempotencyKey() });
                  toast.success(`${formatMoney(amount, acct!.currency)} added to your account`);
                  qc.invalidateQueries();
                  setAmount('');
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
          <Field label="Account">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} · {w.accountNumber}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount" hint="Top-ups are limited to $5,000 per day (USD equivalent).">
            <Input inputMode="decimal" prefix={acct ? CURRENCY_META[acct.currency as 'USD'].symbol : ''} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['CARD', 'Debit card', CreditCard],
                ['BANK', 'Bank account', Building2],
              ] as const
            ).map(([k, l, Icon]) => (
              <button key={k} type="button" onClick={() => setMethod(k)} className={cn('flex items-center gap-3 rounded-2xl border p-4 text-left', method === k ? 'border-gold-500 bg-gold-50 ring-4 ring-gold-100' : 'border-navy-100')}>
                <Icon className="h-5 w-5 text-navy-600" />
                <span className="text-sm font-semibold text-navy-800">{l}</span>
              </button>
            ))}
          </div>
        </div>
      </Modal>
      {dialog}
    </>
  );
}

export function OpenAccountModal({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: string[] }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={onClose} title="Open a new account" subtitle="Each currency account comes with its own account number.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CURRENCIES.map((c) => {
          const has = existing.includes(c);
          return (
            <button
              key={c}
              disabled={has || !!busy}
              onClick={async () => {
                setBusy(c);
                try {
                  await api.post('/accounts', { currency: c });
                  toast.success(`${c} account opened`);
                  qc.invalidateQueries();
                  onClose();
                } catch (e) {
                  handleError(e);
                } finally {
                  setBusy(null);
                }
              }}
              className="flex items-center gap-3 rounded-2xl border border-navy-100 p-4 text-left transition hover:border-gold-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CurrencyFlag currency={c} size="lg" />
              <span>
                <span className="block font-semibold text-navy-800">{CURRENCY_META[c].name}</span>
                <span className="text-xs text-navy-400">{has ? 'Already open' : busy === c ? 'Opening…' : `Open ${c} account`}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
