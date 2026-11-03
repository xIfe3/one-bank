'use client';

import { CURRENCIES, formatMoney } from '@onebank/shared';
import { Button, Card, EmptyState, Field, Input, KeyValue, Modal, PageHeader, Select, Skeleton, Stat, StatusBadge, cn, fmtDate, newIdempotencyKey } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, PiggyBank, Plus, Target, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useConfirmMoney } from '@/components/confirm-money';
import { PinModal } from '@/components/pin-modal';
import { api, type Account } from '@/lib/api';
import { handleError } from '@/lib/form';

interface Goal {
  id: string;
  name: string;
  currency: string;
  balance: string;
  targetAmount: string;
  targetDate: string | null;
  autoSaveAmount: string;
  autoSaveFrequency: string;
  nextAutoSaveAt: string | null;
  status: string;
  progress: number;
}
interface FD {
  id: string;
  principal: string;
  rate: string;
  tenorDays: number;
  currency: string;
  startsAt: string;
  maturesAt: string;
  status: string;
  accruedInterest: string;
  expectedInterest: string;
  interestPaid: string;
}
interface Overview {
  savingsRate: number;
  fixedDepositRates: Record<string, number>;
  goals: Goal[];
  fixedDeposits: FD[];
}

export default function Savings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['savings'], queryFn: () => api.get<Overview>('/savings') });
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<{ accounts: Account[] }>('/accounts') });
  const wallets = accounts?.accounts.filter((a) => a.type === 'CUSTOMER_WALLET' && a.status === 'ACTIVE') ?? [];
  const [newGoal, setNewGoal] = useState(false);
  const [newFd, setNewFd] = useState(false);
  const [move, setMove] = useState<{ goal: Goal; mode: 'deposit' | 'withdraw' } | null>(null);
  const [breakFd, setBreakFd] = useState<FD | null>(null);

  if (isLoading || !data) return <Skeleton className="h-96" />;
  const totalSaved = data.goals.reduce((s, g) => s + Number(g.balance), 0);
  const active = data.fixedDeposits.filter((f) => f.status === 'ACTIVE');

  return (
    <>
      <PageHeader
        title="Savings"
        subtitle={`Goals earn ${data.savingsRate}% p.a., paid monthly. Fixed deposits earn up to ${Math.max(...Object.values(data.fixedDepositRates))}% p.a.`}
        actions={
          <>
            <Button variant="outline" icon={<Lock className="h-4 w-4" />} onClick={() => setNewFd(true)}>
              Fixed deposit
            </Button>
            <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setNewGoal(true)}>
              New goal
            </Button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Saved in goals" value={data.goals.length ? formatMoney(totalSaved, data.goals[0].currency) : '—'} sub={`${data.goals.length} goal(s)`} icon={<Target className="h-5 w-5" />} tone="navy" />
        <Stat label="Active deposits" value={String(active.length)} sub={active.length ? `Next maturity ${fmtDate(active.map((a) => a.maturesAt).sort()[0])}` : 'Lock funds for higher returns'} icon={<Lock className="h-5 w-5" />} />
        <Stat label="Goal interest rate" value={`${data.savingsRate}%`} sub="per annum, paid monthly" icon={<TrendingUp className="h-5 w-5" />} />
      </div>
      <h2 className="mb-3 font-serif text-lg text-navy-800">Savings goals</h2>
      {data.goals.length ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {data.goals.map((g) => (
            <Card key={g.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-serif text-lg text-navy-800">{g.name}</p>
                  <p className="text-xs text-navy-400">
                    {g.targetDate ? `Target ${fmtDate(g.targetDate)}` : 'No deadline'}
                    {g.autoSaveFrequency !== 'NONE' && ` · Auto-save ${formatMoney(g.autoSaveAmount, g.currency)} ${g.autoSaveFrequency.toLowerCase()}`}
                  </p>
                </div>
                {g.status === 'COMPLETED' && <StatusBadge status="COMPLETED" />}
              </div>
              <p className="mt-5 font-sans tabular-nums tracking-tight text-3xl font-semibold text-navy-800">{formatMoney(g.balance, g.currency)}</p>
              <p className="text-sm text-navy-400">of {formatMoney(g.targetAmount, g.currency)}</p>
              <div className="mt-3 h-2.5 rounded-full bg-navy-50">
                <div className="h-2.5 rounded-full bg-gold-sheen transition-all" style={{ width: `${g.progress}%` }} />
              </div>
              <p className="mt-1 text-right text-xs font-semibold text-gold-700">{g.progress}%</p>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="primary" onClick={() => setMove({ goal: g, mode: 'deposit' })}>
                  Add money
                </Button>
                <Button size="sm" variant="outline" disabled={Number(g.balance) <= 0} onClick={() => setMove({ goal: g, mode: 'withdraw' })}>
                  Withdraw
                </Button>
                {Number(g.balance) === 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await api.del(`/savings/goals/${g.id}`);
                        toast.success('Goal closed');
                        qc.invalidateQueries();
                      } catch (e) {
                        handleError(e);
                      }
                    }}
                  >
                    Close goal
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={<PiggyBank className="h-6 w-6" />} title="Start your first goal" body="Saving for a trip, a car or a rainy day? Create a goal and automate it." action={<Button variant="gold" onClick={() => setNewGoal(true)}>Create a goal</Button>} />
        </Card>
      )}

      <h2 className="mb-3 mt-10 font-serif text-lg text-navy-800">Fixed deposits</h2>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          {data.fixedDeposits.length ? (
            <div className="divide-y divide-navy-50">
              {data.fixedDeposits.map((f) => {
                const elapsed = Math.min(100, ((Date.now() - new Date(f.startsAt).getTime()) / (new Date(f.maturesAt).getTime() - new Date(f.startsAt).getTime())) * 100);
                return (
                  <div key={f.id} className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-navy-800">
                          {formatMoney(f.principal, f.currency)} · {f.tenorDays} days @ {Number(f.rate)}%
                        </p>
                        <p className="text-xs text-navy-400">
                          {fmtDate(f.startsAt)} → {fmtDate(f.maturesAt)}
                        </p>
                      </div>
                      <StatusBadge status={f.status} />
                    </div>
                    {f.status === 'ACTIVE' ? (
                      <>
                        <div className="mt-3 h-1.5 rounded-full bg-navy-50">
                          <div className="h-1.5 rounded-full bg-navy-800" style={{ width: `${elapsed}%` }} />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-navy-500">
                          <span>
                            Earned so far {formatMoney(f.accruedInterest, f.currency)} · at maturity {formatMoney(f.expectedInterest, f.currency)}
                          </span>
                          <button onClick={() => setBreakFd(f)} className="font-semibold text-danger hover:underline">
                            Break early
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="mt-2 text-xs text-navy-500">Interest paid: {formatMoney(f.interestPaid, f.currency)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<Lock className="h-6 w-6" />} title="No fixed deposits" body="Lock funds for a fixed term and earn a guaranteed rate." action={<Button onClick={() => setNewFd(true)}>Open a deposit</Button>} />
          )}
        </Card>
        <Card className="border-0 bg-navy-deep text-white">
          <p className="eyebrow text-gold-300">Current rates</p>
          <div className="mt-4 space-y-3">
            {Object.entries(data.fixedDepositRates).map(([d, r]) => (
              <div key={d} className="flex justify-between border-b border-white/10 pb-2 text-sm">
                <span className="text-navy-200">{d} days</span>
                <span className="font-sans tabular-nums tracking-tight text-lg font-semibold text-gold-300">{r}% p.a.</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <NewGoalModal open={newGoal} onClose={() => setNewGoal(false)} wallets={wallets} />
      <NewFdModal open={newFd} onClose={() => setNewFd(false)} wallets={wallets} rates={data.fixedDepositRates} />
      {move && <MoveGoalModal goal={move.goal} mode={move.mode} wallets={wallets.filter((w) => w.currency === move.goal.currency)} onClose={() => setMove(null)} />}
      {breakFd && (
        <PinModal
          open
          danger
          title="Break fixed deposit"
          description={`You will receive your principal (${formatMoney(breakFd.principal, breakFd.currency)}) plus interest earned so far, minus an early-withdrawal penalty (1% of principal, capped at interest earned).`}
          onClose={() => setBreakFd(null)}
          onSubmit={async (pin) => {
            const r = await api.post<{ interest: string; penalty: string }>(`/savings/fixed-deposits/${breakFd.id}/break`, { pin });
            toast.success(`Deposit closed. Interest ${formatMoney(r.interest, breakFd.currency)}, penalty ${formatMoney(r.penalty, breakFd.currency)}.`);
            qc.invalidateQueries();
          }}
        />
      )}
    </>
  );
}

function NewGoalModal({ open, onClose, wallets }: { open: boolean; onClose: () => void; wallets: Account[] }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', currency: wallets[0]?.currency ?? 'USD', targetAmount: '', targetDate: '', autoSaveAmount: '', autoSaveFrequency: 'NONE', autoSaveSourceId: '' });
  const [busy, setBusy] = useState(false);
  const sources = wallets.filter((w) => w.currency === f.currency);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New savings goal"
      footer={
        <Button
          variant="gold"
          loading={busy}
          disabled={!f.name || !Number(f.targetAmount)}
          onClick={async () => {
            setBusy(true);
            try {
              await api.post('/savings/goals', {
                name: f.name,
                currency: f.currency,
                targetAmount: Number(f.targetAmount),
                targetDate: f.targetDate || undefined,
                autoSaveAmount: Number(f.autoSaveAmount) || 0,
                autoSaveFrequency: f.autoSaveFrequency,
                autoSaveSourceId: f.autoSaveFrequency !== 'NONE' ? f.autoSaveSourceId || sources[0]?.id : undefined,
              });
              toast.success('Goal created');
              qc.invalidateQueries();
              onClose();
            } catch (e) {
              handleError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Create goal
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Goal name">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Emergency fund" />
        </Field>
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <Field label="Currency">
            <Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Target amount">
            <Input inputMode="decimal" value={f.targetAmount} onChange={(e) => setF({ ...f, targetAmount: e.target.value.replace(/[^\d.]/g, '') })} />
          </Field>
        </div>
        <Field label="Target date (optional)">
          <Input type="date" value={f.targetDate} onChange={(e) => setF({ ...f, targetDate: e.target.value })} />
        </Field>
        <div className="rounded-2xl bg-ivory p-4">
          <p className="text-sm font-semibold text-navy-800">Auto-save</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Select value={f.autoSaveFrequency} onChange={(e) => setF({ ...f, autoSaveFrequency: e.target.value })}>
              <option value="NONE">Off</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </Select>
            <Input inputMode="decimal" disabled={f.autoSaveFrequency === 'NONE'} placeholder="Amount" value={f.autoSaveAmount} onChange={(e) => setF({ ...f, autoSaveAmount: e.target.value.replace(/[^\d.]/g, '') })} />
          </div>
          {f.autoSaveFrequency !== 'NONE' && (
            <Select className="mt-3" value={f.autoSaveSourceId || sources[0]?.id} onChange={(e) => setF({ ...f, autoSaveSourceId: e.target.value })}>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  From {s.name} · {s.accountNumber}
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>
    </Modal>
  );
}

function MoveGoalModal({ goal, mode, wallets, onClose }: { goal: Goal; mode: 'deposit' | 'withdraw'; wallets: Account[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { request, confirm, dialog } = useConfirmMoney();
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(wallets[0]?.id ?? '');
  const acct = wallets.find((w) => w.id === accountId);
  return (
    <>
      <Modal
        open={!request}
        onClose={onClose}
        title={mode === 'deposit' ? `Add to ${goal.name}` : `Withdraw from ${goal.name}`}
        footer={
          <Button
            variant="gold"
            disabled={!acct || !Number(amount)}
            onClick={() =>
              confirm({
                title: mode === 'deposit' ? 'Move to savings' : 'Withdraw savings',
                summary: [
                  ['Goal', goal.name],
                  [mode === 'deposit' ? 'From' : 'To', `${acct!.name} · ${acct!.accountNumber}`],
                  ['Amount', formatMoney(amount, goal.currency)],
                ],
                run: async ({ pin, otp }) => {
                  await api.post(`/savings/goals/${goal.id}/${mode}`, { accountId, amount: Number(amount), pin, otp, idempotencyKey: newIdempotencyKey() });
                  toast.success(mode === 'deposit' ? 'Saved!' : 'Withdrawn to your account');
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
          <Field label={mode === 'deposit' ? 'From account' : 'To account'}>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} · {formatMoney(w.availableBalance, w.currency)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount" hint={mode === 'withdraw' ? `Available in goal: ${formatMoney(goal.balance, goal.currency)}` : undefined}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" />
          </Field>
        </div>
      </Modal>
      {dialog}
    </>
  );
}

function NewFdModal({ open, onClose, wallets, rates }: { open: boolean; onClose: () => void; wallets: Account[]; rates: Record<string, number> }) {
  const qc = useQueryClient();
  const { request, confirm, dialog } = useConfirmMoney();
  const [fromId, setFromId] = useState('');
  const [amount, setAmount] = useState('');
  const [tenor, setTenor] = useState('365');
  const from = wallets.find((w) => w.id === fromId) ?? wallets[0];
  const interest = (Number(amount) || 0) * ((rates[tenor] ?? 0) / 100) * (Number(tenor) / 365);
  return (
    <>
      <Modal
        open={open && !request}
        onClose={onClose}
        title="Open a fixed deposit"
        subtitle="Minimum $100 or equivalent. Principal + interest paid at maturity."
        footer={
          <Button
            variant="gold"
            disabled={!from || !Number(amount)}
            onClick={() =>
              confirm({
                title: 'Confirm fixed deposit',
                summary: [
                  ['From', `${from!.name} · ${from!.accountNumber}`],
                  ['Amount', formatMoney(amount, from!.currency)],
                  ['Term', `${tenor} days @ ${rates[tenor]}% p.a.`],
                  ['Interest at maturity', formatMoney(interest.toFixed(2), from!.currency)],
                  ['Matures', fmtDate(new Date(Date.now() + Number(tenor) * 864e5))],
                ],
                confirmLabel: 'Lock funds',
                run: async ({ pin, otp }) => {
                  await api.post('/savings/fixed-deposits', { fromAccountId: from!.id, amount: Number(amount), tenorDays: Number(tenor), pin, otp, idempotencyKey: newIdempotencyKey() });
                  toast.success('Fixed deposit opened');
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
          <Field label="From account">
            <Select value={from?.id} onChange={(e) => setFromId(e.target.value)}>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} · {formatMoney(w.availableBalance, w.currency)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount">
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" />
          </Field>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(rates).map(([d, r]) => (
              <button key={d} onClick={() => setTenor(d)} className={cn('rounded-2xl border p-3 text-center', tenor === d ? 'border-gold-500 bg-gold-50 ring-4 ring-gold-100' : 'border-navy-100')}>
                <p className="text-xs text-navy-500">{d} days</p>
                <p className="font-sans tabular-nums tracking-tight text-lg font-semibold text-navy-800">{r}%</p>
              </button>
            ))}
          </div>
          {from && Number(amount) > 0 && <KeyValue items={[['Interest at maturity', formatMoney(interest.toFixed(2), from.currency)], ['Total at maturity', formatMoney((Number(amount) + interest).toFixed(2), from.currency)]]} />}
        </div>
      </Modal>
      {dialog}
    </>
  );
}
