'use client';

import { formatMoney } from '@onebank/shared';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, KeyValue, Modal, PageHeader, Select, Skeleton, StatusBadge, cn, fmtDateTime, newIdempotencyKey } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, CreditCard, Eye, EyeOff, Gauge, Plus, Snowflake, Sun, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useConfirmMoney } from '@/components/confirm-money';
import { PinModal } from '@/components/pin-modal';
import { CardVisual } from '@/components/marketing';
import { api, type Account } from '@/lib/api';
import { handleError } from '@/lib/form';
import { useMe } from '@/lib/session';

interface VCard {
  id: string;
  brand: string;
  label: string;
  nameOnCard: string;
  last4: string;
  expMonth: number;
  expYear: number;
  currency: string;
  status: string;
  statusReason: string | null;
  spendLimit: string;
  color: string;
  accountId: string;
  balance: string;
}
interface CardTx {
  id: string;
  merchant: string;
  category: string;
  amount: string;
  currency: string;
  status: string;
  declineReason: string | null;
  createdAt: string;
}

export default function Cards() {
  const me = useMe();
  const qc = useQueryClient();
  const { data: cards, isLoading } = useQuery({ queryKey: ['cards'], queryFn: () => api.get<VCard[]>('/cards') });
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<{ accounts: Account[] }>('/accounts') });
  const [selected, setSelected] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const [move, setMove] = useState<'fund' | 'withdraw' | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealed, setRevealed] = useState<{ pan: string; cvv: string } | null>(null);
  const [limitOpen, setLimitOpen] = useState(false);
  const [terminate, setTerminate] = useState(false);
  const card = cards?.find((c) => c.id === selected) ?? cards?.[0];
  useEffect(() => setRevealed(null), [card?.id]);
  const { data: txs } = useQuery({ queryKey: ['cards', card?.id, 'tx'], queryFn: () => api.get<CardTx[]>(`/cards/${card!.id}/transactions`), enabled: !!card });
  const wallets = accounts?.accounts.filter((a) => a.type === 'CUSTOMER_WALLET' && a.status === 'ACTIVE') ?? [];

  const toggleFreeze = async () => {
    if (!card) return;
    try {
      await api.post(`/cards/${card.id}/${card.status === 'FROZEN' ? 'unfreeze' : 'freeze'}`);
      toast.success(card.status === 'FROZEN' ? 'Card unfrozen' : 'Card frozen');
      qc.invalidateQueries({ queryKey: ['cards'] });
    } catch (e) {
      handleError(e);
    }
  };

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <>
      <PageHeader
        title="Cards"
        subtitle="Virtual Visa and Mastercard cards with real-time controls."
        actions={
          <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setCreate(true)} disabled={me.status !== 'ACTIVE'}>
            New card
          </Button>
        }
      />
      {!cards?.length || !card ? (
        <Card>
          <EmptyState icon={<CreditCard className="h-6 w-6" />} title="No cards yet" body="Create a virtual card in seconds — perfect for online shopping and subscriptions." action={<Button variant="gold" onClick={() => setCreate(true)}>Create your first card</Button>} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-5">
            <div className="relative">
              <CardVisual
                brand={card.brand}
                last4={card.last4}
                name={card.nameOnCard}
                exp={`${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(2)}`}
                color={card.color}
                pan={revealed?.pan}
                className={cn('mx-auto', card.status === 'FROZEN' && 'opacity-60 grayscale')}
              />
              {card.status === 'FROZEN' && (
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-600/90 px-4 py-1.5 text-sm font-semibold text-white">
                  <Snowflake className="mr-1 inline h-4 w-4" /> Frozen
                </span>
              )}
            </div>
            {revealed && (
              <div className="mx-auto flex max-w-[380px] items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm shadow-card">
                <span>
                  CVV <span className="font-mono font-bold">{revealed.cvv}</span>
                </span>
                <button onClick={() => setRevealed(null)} className="text-xs font-semibold text-navy-500">
                  Hide details
                </button>
              </div>
            )}
            {cards.length > 1 && (
              <div className="flex flex-wrap justify-center gap-2">
                {cards.map((c) => (
                  <button key={c.id} onClick={() => setSelected(c.id)} className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', c.id === card.id ? 'bg-navy-800 text-white' : 'bg-white text-navy-600 shadow-sm')}>
                    {c.label} •••• {c.last4}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {[
                { label: 'Top up', icon: Plus, onClick: () => setMove('fund'), disabled: card.status !== 'ACTIVE' },
                { label: 'Withdraw', icon: ArrowDownToLine, onClick: () => setMove('withdraw'), disabled: card.status !== 'ACTIVE' },
                { label: revealed ? 'Hide' : 'Details', icon: revealed ? EyeOff : Eye, onClick: () => (revealed ? setRevealed(null) : setRevealOpen(true)) },
                { label: card.status === 'FROZEN' ? 'Unfreeze' : 'Freeze', icon: card.status === 'FROZEN' ? Sun : Snowflake, onClick: toggleFreeze },
                { label: 'Limit', icon: Gauge, onClick: () => setLimitOpen(true) },
                { label: 'Terminate', icon: Trash2, onClick: () => setTerminate(true) },
              ].map((a) => (
                <button key={a.label} disabled={a.disabled} onClick={a.onClick} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white p-3 text-xs font-semibold text-navy-700 shadow-card transition hover:-translate-y-0.5 disabled:opacity-40">
                  <a.icon className="h-5 w-5 text-gold-600" />
                  {a.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader title={card.label} subtitle={`${card.brand} · ${card.currency}`} action={<StatusBadge status={card.status} />} />
              {card.statusReason && card.status !== 'ACTIVE' && <Alert tone="info" className="mb-4">{card.statusReason.replace('ADMIN: ', 'Frozen by One Bank: ')}</Alert>}
              <KeyValue
                items={[
                  ['Card balance', <span key="b" className="font-sans tabular-nums tracking-tight font-semibold text-lg">{formatMoney(card.balance, card.currency)}</span>],
                  ['Spend limit per purchase', Number(card.spendLimit) > 0 ? formatMoney(card.spendLimit, card.currency) : 'No limit'],
                  ['Expires', `${String(card.expMonth).padStart(2, '0')}/${card.expYear}`],
                ]}
              />
            </Card>
            <Card>
              <CardHeader title="Card activity" />
              {txs?.length ? (
                <div className="divide-y divide-navy-50">
                  {txs.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-semibold text-navy-800">{t.merchant}</p>
                        <p className="text-xs text-navy-400">
                          {t.category} · {fmtDateTime(t.createdAt)}
                          {t.declineReason && <span className="text-danger"> · {t.declineReason}</span>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={cn('text-sm font-semibold', t.status === 'DECLINED' ? 'text-navy-300 line-through' : 'text-navy-800')}>-{formatMoney(t.amount, t.currency)}</p>
                        {t.status === 'DECLINED' && <Badge tone="danger">Declined</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-navy-400">No card activity yet.</p>
              )}
            </Card>
          </div>
        </div>
      )}
      <CreateCardModal open={create} onClose={() => setCreate(false)} wallets={wallets} onCreated={(id) => setSelected(id)} />
      {card && <MoveModal card={card} mode={move} onClose={() => setMove(null)} wallets={wallets.filter((w) => w.currency === card.currency)} />}
      {card && (
        <PinModal
          open={revealOpen}
          title="Reveal card details"
          onClose={() => setRevealOpen(false)}
          onSubmit={async (pin) => {
            const r = await api.post<{ pan: string; cvv: string }>(`/cards/${card.id}/reveal`, { pin });
            setRevealed(r);
            setTimeout(() => setRevealed(null), 60_000);
          }}
        />
      )}
      {card && (
        <PinModal
          open={terminate}
          title="Terminate card"
          danger
          description={`This permanently cancels ${card.brand} •••• ${card.last4}. Any remaining balance (${formatMoney(card.balance, card.currency)}) returns to your ${card.currency} account.`}
          onClose={() => setTerminate(false)}
          onSubmit={async (pin) => {
            await api.post(`/cards/${card.id}/terminate`, { pin });
            toast.success('Card terminated');
            setSelected(null);
            qc.invalidateQueries();
          }}
        />
      )}
      {card && <LimitModal open={limitOpen} card={card} onClose={() => setLimitOpen(false)} />}
    </>
  );
}

function CreateCardModal({ open, onClose, wallets, onCreated }: { open: boolean; onClose: () => void; wallets: Account[]; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const { request, confirm, dialog } = useConfirmMoney();
  const [brand, setBrand] = useState<'VISA' | 'MASTERCARD'>('VISA');
  const [label, setLabel] = useState('Online shopping');
  const [fundingId, setFundingId] = useState('');
  const [initial, setInitial] = useState('');
  const funding = wallets.find((w) => w.id === fundingId) ?? wallets[0];
  return (
    <>
      <Modal
        open={open && !request}
        onClose={onClose}
        title="Create a virtual card"
        subtitle="Issuance fee: $5 (or equivalent), charged once."
        footer={
          <Button
            variant="gold"
            disabled={!funding}
            onClick={() =>
              confirm({
                title: 'Create card',
                summary: [
                  ['Card', `${brand} · ${label}`],
                  ['Currency', funding!.currency],
                  ['Funded from', `${funding!.name} · ${funding!.accountNumber}`],
                  ['Initial balance', formatMoney(initial || 0, funding!.currency)],
                ],
                confirmLabel: 'Create card',
                run: async ({ pin, otp }) => {
                  const c = await api.post<{ id: string }>('/cards', { fundingAccountId: funding!.id, brand, label, initialFunding: Number(initial) || 0, pin, otp, idempotencyKey: newIdempotencyKey() });
                  toast.success('Your new card is ready');
                  qc.invalidateQueries();
                  onCreated(c.id);
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
          <div className="grid grid-cols-2 gap-3">
            {(['VISA', 'MASTERCARD'] as const).map((b) => (
              <button key={b} onClick={() => setBrand(b)} className={cn('rounded-2xl border p-4 text-sm font-semibold', brand === b ? 'border-gold-500 bg-gold-50 ring-4 ring-gold-100' : 'border-navy-100')}>
                {b === 'VISA' ? 'Visa' : 'Mastercard'}
              </button>
            ))}
          </div>
          <Field label="Card name">
            <Input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Card currency & funding account">
            <Select value={funding?.id} onChange={(e) => setFundingId(e.target.value)}>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.currency} · {w.name} · {formatMoney(w.availableBalance, w.currency)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Initial top-up (optional)">
            <Input inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" />
          </Field>
        </div>
      </Modal>
      {dialog}
    </>
  );
}

function MoveModal({ card, mode, onClose, wallets }: { card: VCard; mode: 'fund' | 'withdraw' | null; onClose: () => void; wallets: Account[] }) {
  const qc = useQueryClient();
  const { request, confirm, dialog } = useConfirmMoney();
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const acct = wallets.find((w) => w.id === accountId) ?? wallets[0];
  if (!mode) return dialog;
  return (
    <>
      <Modal
        open={!request}
        onClose={onClose}
        title={mode === 'fund' ? 'Top up card' : 'Withdraw from card'}
        footer={
          <Button
            variant="gold"
            disabled={!acct || !Number(amount)}
            onClick={() =>
              confirm({
                title: mode === 'fund' ? 'Confirm top-up' : 'Confirm withdrawal',
                summary: [
                  ['Card', `${card.brand} •••• ${card.last4}`],
                  [mode === 'fund' ? 'From' : 'To', `${acct!.name} · ${acct!.accountNumber}`],
                  ['Amount', formatMoney(amount, card.currency)],
                ],
                run: async ({ pin, otp }) => {
                  await api.post(`/cards/${card.id}/${mode}`, { accountId: acct!.id, amount: Number(amount), pin, otp, idempotencyKey: newIdempotencyKey() });
                  toast.success(mode === 'fund' ? 'Card topped up' : 'Moved to your account');
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
        {wallets.length === 0 ? (
          <Alert tone="warning">Open a {card.currency} account to move money to and from this card.</Alert>
        ) : (
          <div className="space-y-4">
            <Field label={mode === 'fund' ? 'From account' : 'To account'}>
              <Select value={acct?.id} onChange={(e) => setAccountId(e.target.value)}>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} · {formatMoney(w.availableBalance, w.currency)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount" hint={mode === 'withdraw' ? `Card balance: ${formatMoney(card.balance, card.currency)}` : undefined}>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" />
            </Field>
          </div>
        )}
      </Modal>
      {dialog}
    </>
  );
}

function LimitModal({ open, card, onClose }: { open: boolean; card: VCard; onClose: () => void }) {
  const qc = useQueryClient();
  const [limit, setLimit] = useState(Number(card.spendLimit) > 0 ? card.spendLimit : '');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Spend limit"
      subtitle="Purchases above this amount are declined. Leave empty for no limit."
      size="sm"
      footer={
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.patch(`/cards/${card.id}/limit`, { spendLimit: Number(limit) || 0 });
              toast.success('Limit updated');
              qc.invalidateQueries({ queryKey: ['cards'] });
              onClose();
            } catch (e) {
              handleError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save limit
        </Button>
      }
    >
      <Input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ''))} placeholder="No limit" />
    </Modal>
  );
}
