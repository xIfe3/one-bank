'use client';

import { formatMoney } from '@onebank/shared';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  KeyValue,
  Modal,
  Money,
  Pagination,
  Select,
  Skeleton,
  StatusBadge,
  Switch,
  Table,
  Tabs,
  Td,
  Textarea,
  entryLabel,
  fmtDate,
  fmtDateTime,
  qs,
  timeAgo,
} from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Bell, Eye, KeyRound, LogOut, Pencil, PlusCircle, ShieldOff, Snowflake, Sun, UserCheck, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionModal, type ActionSpec } from '@/components/action-modal';
import { AdjustModal, CustomTxModal } from '@/components/ledger-forms';
import { api, can, useAdmin, type Paged } from '@/lib/api';

interface Detail {
  user: {
    id: string;
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    country: string;
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
    status: string;
    statusReason: string | null;
    kycLevel: number;
    baseCurrency: string;
    tag: string | null;
    referralCode: string;
    hasPin: boolean;
    twoFactorEnabled: boolean;
    emailVerified: boolean;
    createdAt: string;
    lastLoginAt: string | null;
    failedLoginCount: number;
    lockedUntil: string | null;
    pinLockedUntil: string | null;
    limitOverrideDailyUsd: string | null;
  };
  limits: { dailyUsd: number; singleUsd: number; usedTodayUsd: number; remainingUsd: number; label: string };
  referredBy: { id: string; firstName: string; lastName: string } | null;
  accounts: { id: string; type: string; name: string; currency: string; accountNumber: string | null; balance: string; availableBalance: string; status: string; statusReason: string | null; isPrimary: boolean }[];
  cards: { id: string; brand: string; label: string; last4: string; status: string; statusReason: string | null; currency: string; balance?: string; spendLimit: string; createdAt: string }[];
  loans: { id: string; product: { name: string }; principal: string; totalRepayable: string; amountRepaid: string; currency: string; status: string; createdAt: string }[];
  goals: { id: string; name: string; balance?: string; targetAmount: string; status: string }[];
  fixedDeposits: { id: string; principal: string; rate: string; tenorDays: number; currency: string; status: string; maturesAt: string }[];
  kyc: { id: string; level: number; idType: string; status: string; createdAt: string; reviewNote: string | null }[];
  tickets: { id: string; number: number; subject: string; status: string; lastActivityAt: string }[];
  notes: { id: string; body: string; createdAt: string; admin: { firstName: string; lastName: string } }[];
  flags: { id: string; rule: string; severity: string; details: string; status: string; createdAt: string }[];
}

type Tab = 'overview' | 'transactions' | 'cards' | 'products' | 'sessions' | 'logins' | 'kyc' | 'support' | 'notes' | 'audit' | 'view';

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const admin = useAdmin();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['user', id], queryFn: () => api.get<Detail>(`/admin/users/${id}`) });
  const [tab, setTab] = useState<Tab>('overview');
  const [action, setAction] = useState<ActionSpec | null>(null);
  const [ledger, setLedger] = useState<{ kind: 'adjust' | 'custom'; accountId?: string } | null>(null);
  const [modal, setModal] = useState<'edit' | 'notify' | 'kyc' | 'limits' | null>(null);
  if (isLoading || !data) return <Skeleton className="h-[600px]" />;
  const u = data.user;
  const name = `${u.firstName} ${u.lastName}`;
  const post = (path: string, body: object = {}) => api.post(`/admin/users/${id}${path}`, body);
  const statusAction = (status: string, title: string, danger = true, description?: string) =>
    setAction({ title, danger, confirmLabel: title, description, success: `${name}: ${title.toLowerCase()} done`, run: (reason) => post('/status', { status, reason }) });
  const ledgerAccounts = data.accounts.filter((a) => a.status !== 'CLOSED');

  return (
    <>
      <Link href="/users" className="mb-4 inline-flex items-center gap-1 text-sm text-navy-500 hover:text-navy-800">
        <ArrowLeft className="h-4 w-4" /> Users
      </Link>
      <Card className="mb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={name} className="h-14 w-14 text-base" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl text-navy-800">{name}</h1>
                <StatusBadge status={u.status} />
                <Badge tone="gold">KYC L{u.kycLevel}</Badge>
                {u.twoFactorEnabled && <Badge tone="success">2FA</Badge>}
              </div>
              <p className="text-sm text-navy-400">
                {u.email} · {u.phone} {u.tag && `· @${u.tag}`} · joined {fmtDate(u.createdAt)}
              </p>
              {u.statusReason && u.status !== 'ACTIVE' && <p className="mt-1 text-xs text-danger">Reason: {u.statusReason}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {can(admin, 'ADMIN') && (
              <>
                <Button size="sm" variant="gold" icon={<PlusCircle className="h-4 w-4" />} onClick={() => setLedger({ kind: 'adjust' })} disabled={!ledgerAccounts.length}>
                  Credit / debit
                </Button>
                <Button size="sm" variant="outline" onClick={() => setLedger({ kind: 'custom' })} disabled={!ledgerAccounts.length}>
                  Add transaction
                </Button>
              </>
            )}
            {can(admin, 'ADMIN', 'COMPLIANCE') &&
              (u.status === 'ACTIVE' ? (
                <>
                  <Button size="sm" variant="outline" icon={<ShieldOff className="h-4 w-4" />} onClick={() => statusAction('SUSPENDED', 'Suspend account', true, 'The customer can sign in and view accounts but cannot move money.')}>
                    Suspend
                  </Button>
                  <Button size="sm" variant="danger" icon={<Ban className="h-4 w-4" />} onClick={() => statusAction('BLOCKED', 'Block account', true, 'Sign-in is blocked and all sessions are revoked immediately.')}>
                    Block
                  </Button>
                </>
              ) : u.status === 'SUSPENDED' || u.status === 'BLOCKED' ? (
                <Button size="sm" variant="primary" icon={<UserCheck className="h-4 w-4" />} onClick={() => statusAction('ACTIVE', 'Reinstate account', false)}>
                  Reinstate
                </Button>
              ) : null)}
            {can(admin, 'ADMIN', 'SUPPORT', 'COMPLIANCE') && (
              <Button size="sm" variant="outline" icon={<LogOut className="h-4 w-4" />} onClick={() => setAction({ title: 'Sign out of all devices', confirmLabel: 'Force logout', success: 'All sessions revoked', run: (reason) => post('/force-logout', { reason }) })}>
                Force logout
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={<Bell className="h-4 w-4" />} onClick={() => setModal('notify')}>
              Message
            </Button>
          </div>
        </div>
      </Card>

      <Tabs<Tab>
        className="mb-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'transactions', label: 'Transactions' },
          { value: 'cards', label: 'Cards', count: data.cards.length },
          { value: 'products', label: 'Loans & savings' },
          { value: 'sessions', label: 'Sessions' },
          { value: 'logins', label: 'Login history' },
          { value: 'kyc', label: 'KYC', count: data.kyc.length },
          { value: 'support', label: 'Tickets', count: data.tickets.length },
          { value: 'notes', label: 'Notes', count: data.notes.length },
          { value: 'audit', label: 'Audit' },
          ...(admin.role === 'SUPERADMIN' ? [{ value: 'view' as Tab, label: 'Customer view' }] : []),
        ]}
      />

      {tab === 'overview' && (
        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader title="Accounts" subtitle="Balances are live from the ledger." />
              <Table head={['Account', 'Balance', 'Available', 'Status', '']}>
                {data.accounts.map((a) => (
                  <tr key={a.id}>
                    <Td>
                      <p className="font-semibold text-navy-800">{a.name}</p>
                      <p className="text-xs text-navy-400">
                        {a.type.replace('_', ' ').toLowerCase()} {a.accountNumber && `· ${a.accountNumber}`}
                      </p>
                    </Td>
                    <Td>
                      <Money amount={a.balance} currency={a.currency} className="font-semibold" />
                    </Td>
                    <Td>
                      <Money amount={a.availableBalance} currency={a.currency} />
                    </Td>
                    <Td>
                      <StatusBadge status={a.status} />
                    </Td>
                    <Td className="text-right">
                      {a.status !== 'CLOSED' && can(admin, 'ADMIN') && (
                        <Button size="sm" variant="ghost" icon={<Wallet className="h-3.5 w-3.5" />} onClick={() => setLedger({ kind: 'adjust', accountId: a.id })}>
                          Adjust
                        </Button>
                      )}
                      {a.status !== 'CLOSED' && can(admin, 'ADMIN', 'COMPLIANCE') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={a.status === 'FROZEN' ? <Sun className="h-3.5 w-3.5" /> : <Snowflake className="h-3.5 w-3.5" />}
                          onClick={() =>
                            setAction({
                              title: a.status === 'FROZEN' ? `Unfreeze ${a.name}` : `Freeze ${a.name}`,
                              description: a.status === 'FROZEN' ? undefined : 'Debits will be blocked on this account. Incoming money still lands.',
                              confirmLabel: a.status === 'FROZEN' ? 'Unfreeze' : 'Freeze',
                              danger: a.status !== 'FROZEN',
                              success: 'Account updated',
                              run: (reason) => api.post(`/admin/accounts/${a.id}/status`, { status: a.status === 'FROZEN' ? 'ACTIVE' : 'FROZEN', reason }),
                            })
                          }
                        >
                          {a.status === 'FROZEN' ? 'Unfreeze' : 'Freeze'}
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </Table>
            </Card>
            {data.flags.length > 0 && (
              <Card>
                <CardHeader title="Fraud flags" />
                {data.flags.map((f) => (
                  <div key={f.id} className="flex items-center justify-between border-b border-navy-50 py-2 text-sm last:border-0">
                    <span>
                      <span className="font-semibold text-navy-800">{f.rule}</span> · {f.details}
                    </span>
                    <span className="flex gap-2">
                      <StatusBadge status={f.severity} />
                      <StatusBadge status={f.status} />
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Profile" action={can(admin, 'ADMIN', 'SUPPORT') && <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setModal('edit')}>Edit</Button>} />
              <KeyValue
                items={[
                  ['Date of birth', fmtDate(u.dateOfBirth)],
                  ['Address', [u.addressLine1, u.city, u.state, u.postalCode, u.country].filter(Boolean).join(', ')],
                  ['Base currency', u.baseCurrency],
                  ['Email verified', u.emailVerified ? 'Yes' : 'No'],
                  ['Transaction PIN', u.hasPin ? (u.pinLockedUntil && new Date(u.pinLockedUntil) > new Date() ? 'Locked' : 'Set') : 'Not set'],
                  ['Sign-in lock', u.lockedUntil && new Date(u.lockedUntil) > new Date() ? `Until ${fmtDateTime(u.lockedUntil)}` : 'None'],
                  ['Last sign-in', u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : '—'],
                  ['Referral code', u.referralCode],
                  ['Referred by', data.referredBy ? <Link key="r" href={`/users/${data.referredBy.id}`} className="underline">{data.referredBy.firstName} {data.referredBy.lastName}</Link> : '—'],
                ]}
              />
            </Card>
            <Card>
              <CardHeader title="Limits" action={can(admin, 'ADMIN', 'COMPLIANCE') && <Button size="sm" variant="ghost" onClick={() => setModal('limits')}>Override</Button>} />
              <KeyValue
                items={[
                  ['Tier', `L${u.kycLevel} · ${data.limits.label}`],
                  ['Daily limit', `$${data.limits.dailyUsd.toLocaleString()}${u.limitOverrideDailyUsd ? ' (override)' : ''}`],
                  ['Used today', `$${data.limits.usedTodayUsd.toLocaleString()}`],
                ]}
              />
            </Card>
            <Card>
              <CardHeader title="Security tools" />
              <div className="grid gap-2">
                {can(admin, 'ADMIN', 'COMPLIANCE') && (
                  <Button variant="outline" size="sm" onClick={() => setModal('kyc')}>
                    Set KYC level
                  </Button>
                )}
                {can(admin, 'ADMIN', 'SUPPORT') && (
                  <>
                    <Button variant="outline" size="sm" icon={<KeyRound className="h-4 w-4" />} disabled={!u.twoFactorEnabled} onClick={() => setAction({ title: 'Reset two-factor authentication', confirmLabel: 'Reset 2FA', success: '2FA reset', run: (reason) => post('/reset-2fa', { reason }) })}>
                      Reset 2FA
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setAction({ title: 'Unlock sign-in and PIN', confirmLabel: 'Unlock', success: 'Locks cleared', run: (reason) => post('/reset-pin-lock', { reason }) })}>
                      Clear sign-in / PIN locks
                    </Button>
                    {u.status === 'PENDING_VERIFICATION' && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setAction({ title: 'Resend verification email', confirmLabel: 'Resend', reason: false, success: 'Verification email sent', run: () => post('/resend-verification') })}>
                          Resend verification email
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setAction({ title: 'Mark email as verified', confirmLabel: 'Verify', success: 'Email verified & account activated', run: (reason) => post('/verify-email', { reason }) })}>
                          Mark email verified
                        </Button>
                      </>
                    )}
                  </>
                )}
                {can(admin, 'ADMIN') && u.status !== 'CLOSED' && (
                  <Button variant="ghost" size="sm" className="text-danger" onClick={() => statusAction('CLOSED', 'Close account', true, 'Closing is permanent: the customer is signed out and cannot sign in again.')}>
                    Close account
                  </Button>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'transactions' && <UserTransactions userId={id} />}
      {tab === 'cards' && (
        <Card>
          {data.cards.length ? (
            <Table head={['Card', 'Balance', 'Limit', 'Status', 'Created', '']}>
              {data.cards.map((c) => (
                <tr key={c.id}>
                  <Td className="font-semibold text-navy-800">
                    {c.brand} •••• {c.last4} <span className="text-xs font-normal text-navy-400">{c.label}</span>
                  </Td>
                  <Td>{c.balance ? formatMoney(c.balance, c.currency) : '—'}</Td>
                  <Td>{Number(c.spendLimit) ? formatMoney(c.spendLimit, c.currency) : '—'}</Td>
                  <Td>
                    <StatusBadge status={c.status} />
                  </Td>
                  <Td>{fmtDate(c.createdAt)}</Td>
                  <Td>
                    <Link href={`/cards?q=${c.last4}`} className="text-sm font-semibold text-navy-600 underline">
                      Manage
                    </Link>
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState title="No cards" />
          )}
        </Card>
      )}
      {tab === 'products' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Loans" />
            {data.loans.length ? (
              data.loans.map((l) => (
                <div key={l.id} className="flex justify-between border-b border-navy-50 py-3 text-sm last:border-0">
                  <span>
                    <span className="font-semibold text-navy-800">{l.product.name}</span> · {formatMoney(l.principal, l.currency)} · repaid {formatMoney(l.amountRepaid, l.currency)} / {formatMoney(l.totalRepayable, l.currency)}
                  </span>
                  <StatusBadge status={l.status} />
                </div>
              ))
            ) : (
              <p className="text-sm text-navy-400">No loans.</p>
            )}
          </Card>
          <Card>
            <CardHeader title="Savings & deposits" />
            {data.goals.map((g) => (
              <div key={g.id} className="flex justify-between border-b border-navy-50 py-3 text-sm">
                <span className="font-semibold text-navy-800">{g.name}</span>
                <span>
                  {g.balance} / {g.targetAmount} <StatusBadge status={g.status} />
                </span>
              </div>
            ))}
            {data.fixedDeposits.map((f) => (
              <div key={f.id} className="flex justify-between border-b border-navy-50 py-3 text-sm">
                <span>
                  Fixed deposit {formatMoney(f.principal, f.currency)} · {f.tenorDays}d @ {Number(f.rate)}%
                </span>
                <span>
                  {fmtDate(f.maturesAt)} <StatusBadge status={f.status} />
                </span>
              </div>
            ))}
            {!data.goals.length && !data.fixedDeposits.length && <p className="text-sm text-navy-400">None.</p>}
          </Card>
        </div>
      )}
      {tab === 'sessions' && <UserSessions userId={id} onRevoke={(sessionId) => setAction({ title: 'Revoke session', confirmLabel: 'Revoke', success: 'Session revoked', run: (reason) => post('/force-logout', { sessionId, reason }) })} />}
      {tab === 'logins' && <UserLogins userId={id} />}
      {tab === 'kyc' && (
        <Card>
          {data.kyc.length ? (
            <Table head={['Submitted', 'Level', 'Document', 'Status', 'Note']}>
              {data.kyc.map((k) => (
                <tr key={k.id}>
                  <Td>{fmtDateTime(k.createdAt)}</Td>
                  <Td>L{k.level}</Td>
                  <Td>{k.idType.replace(/_/g, ' ').toLowerCase()}</Td>
                  <Td>
                    <StatusBadge status={k.status} />
                  </Td>
                  <Td className="text-xs">{k.reviewNote ?? '—'}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState title="No KYC submissions" />
          )}
          <Link href="/kyc" className="mt-4 inline-block text-sm font-semibold text-navy-600 underline">
            Open KYC queue
          </Link>
        </Card>
      )}
      {tab === 'support' && (
        <Card>
          {data.tickets.length ? (
            data.tickets.map((t) => (
              <Link key={t.id} href={`/support/${t.id}`} className="flex justify-between border-b border-navy-50 py-3 text-sm last:border-0 hover:bg-ivory">
                <span>
                  #{t.number} <span className="font-semibold text-navy-800">{t.subject}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-navy-400">
                  {timeAgo(t.lastActivityAt)} <StatusBadge status={t.status} />
                </span>
              </Link>
            ))
          ) : (
            <EmptyState title="No tickets" />
          )}
        </Card>
      )}
      {tab === 'notes' && <Notes userId={id} notes={data.notes} />}
      {tab === 'audit' && <UserAudit userId={id} />}
      {tab === 'view' && <CustomerView userId={id} />}

      <ActionModal spec={action} onClose={() => setAction(null)} />
      {ledger?.kind === 'adjust' && <AdjustModal accounts={ledgerAccounts} defaultAccountId={ledger.accountId} onClose={() => setLedger(null)} />}
      {ledger?.kind === 'custom' && <CustomTxModal accounts={ledgerAccounts} defaultAccountId={ledger.accountId} onClose={() => setLedger(null)} />}
      {modal === 'edit' && <EditProfile user={u} onClose={() => setModal(null)} />}
      {modal === 'notify' && <NotifyModal userId={id} onClose={() => setModal(null)} />}
      {modal === 'kyc' && (
        <LevelModal
          current={u.kycLevel}
          onClose={() => setModal(null)}
          onSave={async (level, reason) => {
            await post('/kyc-level', { level, reason });
            toast.success('KYC level updated');
            qc.invalidateQueries();
          }}
        />
      )}
      {modal === 'limits' && (
        <LimitModal
          current={u.limitOverrideDailyUsd}
          onClose={() => setModal(null)}
          onSave={async (dailyUsd, reason) => {
            await post('/limits', { dailyUsd, reason });
            toast.success('Limit updated');
            qc.invalidateQueries();
          }}
        />
      )}
    </>
  );
}

interface TxRow {
  rowId: string;
  id: string;
  reference: string;
  type: string;
  status: string;
  description: string;
  amount: string;
  currency: string;
  accountName: string;
  balanceAfter: string | null;
  valueDate: string;
}

function UserTransactions({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const { data } = useQuery({ queryKey: ['user-tx', userId, page], queryFn: () => api.get<Paged<TxRow>>(`/admin/users/${userId}/transactions${qs({ page, pageSize: 25 })}`) });
  if (!data) return <Skeleton className="h-80" />;
  return (
    <Card>
      <Table head={['Date', 'Description', 'Type', 'Account', 'Amount', 'Balance', 'Status']}>
        {data.items.map((t) => (
          <tr key={t.rowId} className="hover:bg-ivory">
            <Td>{fmtDate(t.valueDate)}</Td>
            <Td>
              <Link href={`/transactions/${t.id}`} className="font-semibold text-navy-800 hover:underline">
                {t.description}
              </Link>
              <p className="font-mono text-[11px] text-navy-400">{t.reference}</p>
            </Td>
            <Td>{entryLabel(t.type)}</Td>
            <Td className="text-xs">{t.accountName}</Td>
            <Td>
              <Money amount={t.amount} currency={t.currency} sign className="font-semibold" />
            </Td>
            <Td>{t.balanceAfter ? formatMoney(t.balanceAfter, t.currency) : '—'}</Td>
            <Td>
              <StatusBadge status={t.status} />
            </Td>
          </tr>
        ))}
      </Table>
      <Pagination page={data.page} pages={data.pages} onChange={setPage} />
    </Card>
  );
}

function UserSessions({ userId, onRevoke }: { userId: string; onRevoke: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const { data } = useQuery({ queryKey: ['user-sessions', userId, all], queryFn: () => api.get<{ id: string; browser: string; os: string; ip: string; location: string; createdAt: string; lastSeenAt: string; revokedAt: string | null; revokedReason: string | null }[]>(`/admin/users/${userId}/sessions?all=${all}`) });
  return (
    <Card>
      <CardHeader title="Devices" action={<label className="flex items-center gap-2 text-sm text-navy-600"><Switch checked={all} onChange={setAll} label="Include revoked" /> Include revoked</label>} />
      <Table head={['Device', 'Location', 'IP', 'Signed in', 'Last active', 'Status', '']}>
        {data?.map((s) => (
          <tr key={s.id}>
            <Td className="font-semibold text-navy-800">
              {s.browser} · {s.os}
            </Td>
            <Td>{s.location}</Td>
            <Td className="font-mono text-xs">{s.ip}</Td>
            <Td>{fmtDateTime(s.createdAt)}</Td>
            <Td>{timeAgo(s.lastSeenAt)}</Td>
            <Td>{s.revokedAt ? <span className="text-xs text-navy-400">Revoked: {s.revokedReason}</span> : <Badge tone="success">Active</Badge>}</Td>
            <Td>
              {!s.revokedAt && (
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => onRevoke(s.id)}>
                  Revoke
                </Button>
              )}
            </Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function UserLogins({ userId }: { userId: string }) {
  const { data } = useQuery({ queryKey: ['user-logins', userId], queryFn: () => api.get<{ id: string; success: boolean; reason: string | null; browser: string; os: string; ip: string; location: string; createdAt: string }[]>(`/admin/users/${userId}/logins`) });
  return (
    <Card>
      <Table head={['Time', 'Result', 'Device', 'Location', 'IP']}>
        {data?.map((l) => (
          <tr key={l.id}>
            <Td>{fmtDateTime(l.createdAt)}</Td>
            <Td>{l.success ? <Badge tone="success">Success</Badge> : <Badge tone="danger">{l.reason ?? 'failed'}</Badge>}</Td>
            <Td>
              {l.browser} · {l.os}
            </Td>
            <Td>{l.location}</Td>
            <Td className="font-mono text-xs">{l.ip}</Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function UserAudit({ userId }: { userId: string }) {
  const { data } = useQuery({ queryKey: ['user-audit', userId], queryFn: () => api.get<{ id: string; actorEmail: string | null; actorType: string; action: string; reason: string | null; createdAt: string }[]>(`/admin/users/${userId}/audit`) });
  return (
    <Card>
      <Table head={['Time', 'Actor', 'Action', 'Reason']}>
        {data?.map((a) => (
          <tr key={a.id}>
            <Td>{fmtDateTime(a.createdAt)}</Td>
            <Td>{a.actorEmail ?? a.actorType}</Td>
            <Td className="font-mono text-xs">{a.action}</Td>
            <Td className="max-w-md whitespace-normal text-xs">{a.reason ?? '—'}</Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function Notes({ userId, notes }: { userId: string; notes: Detail['notes'] }) {
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  return (
    <Card>
      <div className="flex gap-2">
        <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add an internal note (visible to staff only)" />
        <Button
          disabled={!body.trim()}
          onClick={async () => {
            await api.post(`/admin/users/${userId}/notes`, { body });
            setBody('');
            qc.invalidateQueries({ queryKey: ['user', userId] });
          }}
        >
          Add
        </Button>
      </div>
      <div className="mt-5 space-y-3">
        {notes.map((n) => (
          <div key={n.id} className="rounded-xl bg-amber-50/60 p-3">
            <p className="whitespace-pre-wrap text-sm text-navy-800">{n.body}</p>
            <p className="mt-1 text-xs text-navy-400">
              {n.admin.firstName} {n.admin.lastName} · {fmtDateTime(n.createdAt)}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CustomerView({ userId }: { userId: string }) {
  const { data } = useQuery({ queryKey: ['customer-view', userId], queryFn: () => api.get<{ summary: { totalBalance: string; baseCurrency: string; accounts: { id: string; name: string; currency: string; availableBalance: string }[] }; recent: TxRow[] }>(`/admin/users/${userId}/customer-view`) });
  if (!data) return <Skeleton className="h-80" />;
  return (
    <div className="space-y-4">
      <Alert tone="gold" title="Read-only customer view">
        <Eye className="mr-1 inline h-4 w-4" /> This is exactly what the customer sees on their dashboard. Opening it is recorded in the audit log.
      </Alert>
      <Card className="border-0 bg-navy-deep text-white">
        <p className="text-sm text-navy-200">Total balance</p>
        <p className="font-sans tabular-nums tracking-tight text-4xl font-semibold">{formatMoney(data.summary.totalBalance, data.summary.baseCurrency)}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.summary.accounts.map((a) => (
            <span key={a.id} className="rounded-full bg-white/10 px-3 py-1 text-xs">
              {a.name}: {formatMoney(a.availableBalance, a.currency)}
            </span>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Recent activity" />
        {data.recent.map((t) => (
          <div key={t.rowId} className="flex justify-between border-b border-navy-50 py-2.5 text-sm last:border-0">
            <span className="text-navy-700">{t.description}</span>
            <Money amount={t.amount} currency={t.currency} sign className="font-semibold" />
          </div>
        ))}
      </Card>
    </div>
  );
}

function EditProfile({ user, onClose }: { user: Detail['user']; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone, addressLine1: user.addressLine1, city: user.city, state: user.state, postalCode: user.postalCode, reason: '' });
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit profile"
      size="lg"
      footer={
        <Button
          loading={busy}
          disabled={f.reason.length < 3}
          onClick={async () => {
            setBusy(true);
            try {
              await api.patch(`/admin/users/${user.id}`, f);
              toast.success('Profile updated');
              qc.invalidateQueries();
              onClose();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {(['firstName', 'lastName', 'email', 'phone', 'addressLine1', 'city', 'state', 'postalCode'] as const).map((k) => (
          <Field key={k} label={k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}>
            <Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </Field>
        ))}
        <Field label="Reason (audit)" className="sm:col-span-2">
          <Textarea rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function NotifyModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [f, setF] = useState({ title: '', body: '', link: '', inApp: true, email: true });
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Message customer"
      footer={
        <Button
          loading={busy}
          disabled={f.title.length < 2 || f.body.length < 2 || (!f.inApp && !f.email)}
          onClick={async () => {
            setBusy(true);
            try {
              await api.post(`/admin/users/${userId}/notify`, { title: f.title, body: f.body, link: f.link || undefined, channels: [...(f.inApp ? ['IN_APP'] : []), ...(f.email ? ['EMAIL'] : [])] });
              toast.success('Message sent');
              onClose();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Send
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="Message">
          <Textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
        <Field label="Link (optional)" hint="e.g. /app/settings/kyc">
          <Input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />
        </Field>
        <div className="flex gap-6 text-sm text-navy-700">
          <label className="flex items-center gap-2">
            <Switch checked={f.inApp} onChange={(v) => setF({ ...f, inApp: v })} label="In-app" /> In-app
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={f.email} onChange={(v) => setF({ ...f, email: v })} label="Email" /> Email
          </label>
        </div>
      </div>
    </Modal>
  );
}

function LevelModal({ current, onClose, onSave }: { current: number; onClose: () => void; onSave: (level: number, reason: string) => Promise<void> }) {
  const [level, setLevel] = useState(String(current));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Set KYC level"
      size="sm"
      footer={
        <Button
          loading={busy}
          disabled={reason.length < 3}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(Number(level), reason);
              onClose();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </Button>
      }
    >
      <div className="space-y-4">
        <Select value={level} onChange={(e) => setLevel(e.target.value)}>
          {[0, 1, 2, 3].map((l) => (
            <option key={l} value={l}>
              Level {l}
            </option>
          ))}
        </Select>
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
      </div>
    </Modal>
  );
}

function LimitModal({ current, onClose, onSave }: { current: string | null; onClose: () => void; onSave: (v: number | null, reason: string) => Promise<void> }) {
  const [value, setValue] = useState(current ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Daily limit override (USD)"
      subtitle="Leave empty to use the KYC tier default."
      size="sm"
      footer={
        <Button
          loading={busy}
          disabled={reason.length < 3}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(value ? Number(value) : null, reason);
              onClose();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </Button>
      }
    >
      <div className="space-y-4">
        <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Tier default" />
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
      </div>
    </Modal>
  );
}
