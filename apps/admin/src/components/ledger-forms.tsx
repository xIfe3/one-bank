'use client';

import { formatMoney } from '@onebank/shared';
import { Alert, Button, Field, Input, Modal, Select, Switch, Textarea, cn } from '@onebank/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export interface AccountOpt {
  id: string;
  name: string;
  currency: string;
  accountNumber: string | null;
  balance: string;
  type: string;
}

function Shell({ title, subtitle, onClose, busy, error, onSubmit, disabled, children, label }: { title: string; subtitle?: string; onClose: () => void; busy: boolean; error: string | null; onSubmit: () => void; disabled: boolean; children: React.ReactNode; label: string }) {
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" loading={busy} disabled={disabled} onClick={onSubmit}>
            {label}
          </Button>
        </>
      }
    >
      <div className="space-y-4">{children}</div>
      {error && <Alert tone="danger" className="mt-4">{error}</Alert>}
    </Modal>
  );
}

/** Credit or debit a customer account against bank equity (balanced ledger entry). */
export function AdjustModal({ accounts, defaultAccountId, onClose }: { accounts: AccountOpt[]; defaultAccountId?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ accountId: defaultAccountId ?? accounts[0]?.id ?? '', direction: 'CREDIT', amount: '', kind: 'ADJUSTMENT', description: '', reason: '', valueDate: '', notifyUser: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const acct = accounts.find((a) => a.id === f.accountId);
  return (
    <Shell
      title="Credit / debit account"
      subtitle="Posts a balanced entry against BANK_EQUITY and appears in the customer’s history."
      onClose={onClose}
      busy={busy}
      error={error}
      label={`${f.direction === 'CREDIT' ? 'Credit' : 'Debit'} ${acct && Number(f.amount) ? formatMoney(f.amount, acct.currency) : ''}`}
      disabled={!acct || !Number(f.amount) || f.description.length < 3 || f.reason.length < 3}
      onSubmit={async () => {
        setBusy(true);
        setError(null);
        try {
          await api.post('/admin/ledger/adjust', { ...f, amount: Number(f.amount), valueDate: f.valueDate || undefined });
          toast.success('Ledger entry posted');
          qc.invalidateQueries();
          onClose();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        {['CREDIT', 'DEBIT'].map((d) => (
          <button key={d} onClick={() => setF({ ...f, direction: d })} className={cn('rounded-xl border p-3 text-sm font-semibold', f.direction === d ? (d === 'CREDIT' ? 'border-success bg-emerald-50 text-success' : 'border-danger bg-red-50 text-danger') : 'border-navy-100')}>
            {d === 'CREDIT' ? '+ Credit (add funds)' : '− Debit (remove funds)'}
          </button>
        ))}
      </div>
      <Field label="Account">
        <Select value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.accountNumber ?? a.type} · {formatMoney(a.balance, a.currency)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={`Amount (${acct?.currency ?? ''})`}>
          <Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') })} />
        </Field>
        <Field label="Kind">
          <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {['ADJUSTMENT', 'BONUS', 'REFUND', 'FEE', 'CHARGEBACK'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Description shown to customer">
        <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. Goodwill credit" />
      </Field>
      <Field label="Value date (optional, for back-dating)">
        <Input type="date" value={f.valueDate} onChange={(e) => setF({ ...f, valueDate: e.target.value })} />
      </Field>
      <Field label="Internal reason (audit log)">
        <Textarea rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      </Field>
      <label className="flex items-center gap-3 text-sm text-navy-700">
        <Switch checked={f.notifyUser} onChange={(v) => setF({ ...f, notifyUser: v })} label="Notify customer" /> Notify customer (in-app + email)
      </label>
    </Shell>
  );
}

const TYPES = [
  ['DEPOSIT', 'Deposit'],
  ['WIRE', 'Wire transfer'],
  ['INTERBANK', 'Bank transfer'],
  ['INTERNAL_TRANSFER', 'Transfer'],
  ['BILL', 'Bill payment'],
  ['CARD_SPEND', 'Card purchase'],
  ['FEE', 'Fee'],
  ['INTEREST', 'Interest'],
  ['ADMIN_CREDIT', 'Credit'],
  ['ADMIN_DEBIT', 'Debit'],
];

/** Add a realistic transaction to a customer's history (still a balanced ledger posting). */
export function CustomTxModal({ accounts, defaultAccountId, onClose }: { accounts: AccountOpt[]; defaultAccountId?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    accountId: defaultAccountId ?? accounts[0]?.id ?? '',
    direction: 'CREDIT',
    type: 'WIRE',
    amount: '',
    counterpartyName: '',
    counterpartyAccount: '',
    counterpartyBank: '',
    description: '',
    reference: '',
    valueDate: '',
    status: 'COMPLETED',
    reason: '',
    notifyUser: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const acct = accounts.find((a) => a.id === f.accountId);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Shell
      title="Add custom transaction"
      subtitle="Create a realistic entry (e.g. “Incoming wire from ACME Ltd”). It posts to the ledger against bank equity."
      onClose={onClose}
      busy={busy}
      error={error}
      label="Post transaction"
      disabled={!acct || !Number(f.amount) || f.counterpartyName.length < 2 || f.description.length < 3 || f.reason.length < 3}
      onSubmit={async () => {
        setBusy(true);
        setError(null);
        try {
          await api.post('/admin/ledger/custom-transaction', { ...f, amount: Number(f.amount), reference: f.reference || undefined, valueDate: f.valueDate || undefined });
          toast.success('Transaction added');
          qc.invalidateQueries();
          onClose();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Account" className="sm:col-span-2">
          <Select value={f.accountId} onChange={set('accountId')}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {formatMoney(a.balance, a.currency)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Direction">
          <Select value={f.direction} onChange={set('direction')}>
            <option value="CREDIT">Credit (in)</option>
            <option value="DEBIT">Debit (out)</option>
          </Select>
        </Field>
        <Field label="Type">
          <Select value={f.type} onChange={set('type')}>
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`Amount (${acct?.currency ?? ''})`}>
          <Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') })} />
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={set('status')}>
            <option value="COMPLETED">Completed</option>
            <option value="PENDING" disabled={f.direction === 'CREDIT'}>
              Pending (debit hold)
            </option>
          </Select>
        </Field>
        <Field label="Counterparty name">
          <Input value={f.counterpartyName} onChange={set('counterpartyName')} placeholder="ACME Ltd" />
        </Field>
        <Field label="Counterparty account">
          <Input value={f.counterpartyAccount} onChange={set('counterpartyAccount')} />
        </Field>
        <Field label="Counterparty bank">
          <Input value={f.counterpartyBank} onChange={set('counterpartyBank')} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Input value={f.description} onChange={set('description')} placeholder="Incoming wire from ACME Ltd" />
        </Field>
        <Field label="Reference (optional)">
          <Input value={f.reference} onChange={set('reference')} placeholder="Auto-generated" />
        </Field>
        <Field label="Value date (optional)">
          <Input type="date" value={f.valueDate} onChange={set('valueDate')} />
        </Field>
      </div>
      <Field label="Internal reason (audit log)">
        <Textarea rows={2} value={f.reason} onChange={set('reason')} />
      </Field>
      <label className="flex items-center gap-3 text-sm text-navy-700">
        <Switch checked={f.notifyUser} onChange={(v) => setF({ ...f, notifyUser: v })} label="Notify customer" /> Notify customer
      </label>
    </Shell>
  );
}
