'use client';

import { passwordSchema } from '@onebank/shared';
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Modal, PinInput, Skeleton, Table, Td, fmtDateTime, timeAgo } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Laptop, Lock, Mail, ShieldCheck, Smartphone, Tablet } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { handleError } from '@/lib/form';
import { useMe } from '@/lib/session';

interface Session {
  id: string;
  browser: string;
  os: string;
  deviceType: string;
  ip: string;
  location: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}
interface LoginEvent {
  id: string;
  success: boolean;
  reason: string | null;
  browser: string;
  os: string;
  ip: string;
  location: string;
  createdAt: string;
}

export default function Security() {
  const me = useMe();
  const qc = useQueryClient();
  const { data: sessions, isLoading } = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<Session[]>('/me/sessions'), refetchInterval: 60_000 });
  const { data: logins } = useQuery({ queryKey: ['logins'], queryFn: () => api.get<LoginEvent[]>('/me/login-history') });
  const [modal, setModal] = useState<'password' | 'email' | 'pin' | 'pinReset' | '2fa' | '2faOff' | null>(null);

  const revoke = async (id?: string) => {
    try {
      if (id) await api.del(`/me/sessions/${id}`);
      else {
        const r = await api.post<{ revoked: number }>('/me/sessions/revoke-others');
        toast.success(`Signed out of ${r.revoked} other device(s)`);
      }
      qc.invalidateQueries({ queryKey: ['sessions'] });
    } catch (e) {
      handleError(e);
    }
  };

  const Icon = (t: string) => (t === 'mobile' ? Smartphone : t === 'tablet' ? Tablet : Laptop);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { title: 'Password', desc: 'Change your sign-in password.', icon: Lock, action: <Button size="sm" variant="outline" onClick={() => setModal('password')}>Change</Button> },
          {
            title: 'Two-factor authentication',
            desc: me.twoFactorEnabled ? 'Enabled with an authenticator app.' : 'Add a second layer of protection.',
            icon: ShieldCheck,
            badge: me.twoFactorEnabled ? <Badge tone="success">On</Badge> : <Badge tone="warning">Off</Badge>,
            action: me.twoFactorEnabled ? (
              <Button size="sm" variant="outline" onClick={() => setModal('2faOff')}>
                Turn off
              </Button>
            ) : (
              <Button size="sm" variant="gold" onClick={() => setModal('2fa')}>
                Turn on
              </Button>
            ),
          },
          {
            title: 'Transaction PIN',
            desc: me.hasPin ? 'Used to approve every payment.' : 'Required before you can send money.',
            icon: KeyRound,
            badge: me.hasPin ? <Badge tone="success">Set</Badge> : <Badge tone="warning">Not set</Badge>,
            action: (
              <div className="flex gap-1">
                <Button size="sm" variant={me.hasPin ? 'outline' : 'gold'} onClick={() => setModal('pin')}>
                  {me.hasPin ? 'Change' : 'Create PIN'}
                </Button>
                {me.hasPin && (
                  <Button size="sm" variant="ghost" onClick={() => setModal('pinReset')}>
                    Forgot?
                  </Button>
                )}
              </div>
            ),
          },
        ].map((c) => (
          <Card key={c.title}>
            <div className="flex items-start justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy-800 text-gold-300">
                <c.icon className="h-5 w-5" />
              </span>
              {c.badge}
            </div>
            <p className="mt-4 font-semibold text-navy-800">{c.title}</p>
            <p className="mt-1 text-sm text-navy-400">{c.desc}</p>
            <div className="mt-4">{c.action}</div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Where you’re signed in"
          subtitle="Sign out of any device you don’t recognise, then change your password."
          action={
            (sessions?.length ?? 0) > 1 && (
              <Button size="sm" variant="outline" onClick={() => revoke()}>
                Sign out all other devices
              </Button>
            )
          }
        />
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <div className="divide-y divide-navy-50">
            {sessions?.map((s) => {
              const DI = Icon(s.deviceType);
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-4 py-4">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-navy-50 text-navy-600">
                    <DI className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold text-navy-800">
                      {s.browser} on {s.os} {s.current && <Badge tone="success">This device</Badge>}
                    </p>
                    <p className="text-sm text-navy-400">
                      {s.location} · {s.ip} · signed in {fmtDateTime(s.createdAt)} · active {timeAgo(s.lastSeenAt)}
                    </p>
                  </div>
                  {!s.current && (
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => revoke(s.id)}>
                      Sign out
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Sign-in history" subtitle="Your last 50 sign-in attempts." action={<Button size="sm" variant="ghost" icon={<Mail className="h-4 w-4" />} onClick={() => setModal('email')}>Change email</Button>} />
        <Table head={['Time', 'Result', 'Device', 'Location', 'IP']}>
          {logins?.map((l) => (
            <tr key={l.id}>
              <Td>{fmtDateTime(l.createdAt)}</Td>
              <Td>{l.success ? <Badge tone="success">Success</Badge> : <Badge tone="danger">{(l.reason ?? 'failed').replace(/_/g, ' ')}</Badge>}</Td>
              <Td>
                {l.browser} · {l.os}
              </Td>
              <Td>{l.location}</Td>
              <Td className="font-mono text-xs">{l.ip}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      <PasswordModal open={modal === 'password'} onClose={() => setModal(null)} />
      <EmailModal open={modal === 'email'} onClose={() => setModal(null)} />
      <PinSetModal open={modal === 'pin'} onClose={() => setModal(null)} />
      <PinResetModal open={modal === 'pinReset'} onClose={() => setModal(null)} />
      {modal === '2fa' && <TwoFactorSetup onClose={() => setModal(null)} />}
      <TwoFactorDisable open={modal === '2faOff'} onClose={() => setModal(null)} />
    </div>
  );
}

function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const err = next && !passwordSchema.safeParse(next).success ? passwordSchema.safeParse(next).error?.issues[0]?.message : undefined;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change password"
      subtitle="Other devices will be signed out."
      footer={
        <Button
          loading={busy}
          disabled={!cur || !next || !!err}
          onClick={async () => {
            setBusy(true);
            try {
              await api.post('/me/password', { currentPassword: cur, newPassword: next });
              toast.success('Password changed');
              setCur('');
              setNext('');
              onClose();
            } catch (e) {
              handleError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Update password
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Current password">
          <Input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </Field>
        <Field label="New password" error={err}>
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function EmailModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change email address"
      subtitle="We’ll send a confirmation link to your new address."
      footer={
        <Button
          loading={busy}
          disabled={!email || !pw}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api.post<{ message: string }>('/me/email', { newEmail: email, password: pw });
              toast.success(r.message);
              onClose();
            } catch (e) {
              handleError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Send confirmation
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="New email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Current password">
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function PinSetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transaction PIN"
      subtitle="Choose a 4-digit PIN you don’t use anywhere else."
      footer={
        <Button
          variant="gold"
          loading={busy}
          disabled={pin.length !== 4 || pin !== confirm || !pw}
          onClick={async () => {
            setBusy(true);
            try {
              await api.post('/me/pin', { pin, password: pw });
              toast.success('Transaction PIN saved');
              qc.invalidateQueries({ queryKey: ['me'] });
              setPin('');
              setConfirm('');
              setPw('');
              onClose();
            } catch (e) {
              handleError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save PIN
        </Button>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-center text-sm font-medium text-navy-600">New PIN</p>
          <PinInput value={pin} onChange={setPin} autoFocus />
        </div>
        <div>
          <p className="mb-2 text-center text-sm font-medium text-navy-600">Confirm PIN</p>
          <PinInput value={confirm} onChange={setConfirm} />
          {confirm.length === 4 && pin !== confirm && <p className="mt-2 text-center text-xs text-danger">PINs don’t match</p>}
        </div>
        <Field label="Your password">
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function PinResetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reset transaction PIN"
      footer={
        sent ? (
          <Button
            variant="gold"
            loading={busy}
            disabled={code.length !== 6 || pin.length !== 4}
            onClick={async () => {
              setBusy(true);
              try {
                await api.post('/me/pin/reset', { token: code, pin });
                toast.success('PIN reset');
                onClose();
              } catch (e) {
                handleError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            Reset PIN
          </Button>
        ) : (
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.post('/me/pin/forgot');
                setSent(true);
                toast.success('Code sent to your email');
              } catch (e) {
                handleError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            Email me a code
          </Button>
        )
      }
    >
      {sent ? (
        <div className="space-y-5">
          <Field label="6-digit code from your email">
            <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" className="text-center tracking-[0.4em]" />
          </Field>
          <div>
            <p className="mb-2 text-center text-sm font-medium text-navy-600">New PIN</p>
            <PinInput value={pin} onChange={setPin} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-navy-500">We’ll email a one-time code to verify it’s you.</p>
      )}
    </Modal>
  );
}

function TwoFactorSetup({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['2fa-setup'], queryFn: () => api.post<{ secret: string; qr: string }>('/me/2fa/setup'), gcTime: 0, staleTime: Infinity });
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={codes ? 'Save your backup codes' : 'Set up two-factor authentication'}
      footer={
        codes ? (
          <Button
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['me'] });
              onClose();
            }}
          >
            I’ve saved them
          </Button>
        ) : (
          <Button
            variant="gold"
            loading={busy}
            disabled={code.length !== 6}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api.post<{ backupCodes: string[] }>('/me/2fa/enable', { code });
                setCodes(r.backupCodes);
                toast.success('Two-factor authentication enabled');
              } catch (e) {
                handleError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            Verify & enable
          </Button>
        )
      }
    >
      {codes ? (
        <div>
          <Alert tone="warning" className="mb-4">
            Each code works once. Store them somewhere safe — they’re the only way in if you lose your phone.
          </Alert>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-navy-900 p-4 font-mono text-sm text-gold-200">
            {codes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-3"
            onClick={() => {
              navigator.clipboard.writeText(codes.join('\n'));
              toast.success('Copied');
            }}
          >
            Copy codes
          </Button>
        </div>
      ) : isLoading ? (
        <Skeleton className="h-60" />
      ) : error ? (
        <Alert tone="danger">{(error as Error).message}</Alert>
      ) : (
        data && (
          <div className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-navy-600">
              <li>Install an authenticator app (Google Authenticator, 1Password, Authy).</li>
              <li>Scan this QR code, or enter the key manually.</li>
              <li>Enter the 6-digit code shown in the app.</li>
            </ol>
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-ivory p-4">
              <Image src={data.qr} alt="Two-factor QR code" width={200} height={200} unoptimized />
              <code className="break-all rounded-lg bg-white px-3 py-1.5 text-xs text-navy-700">{data.secret}</code>
            </div>
            <Field label="6-digit code">
              <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" className="text-center text-lg tracking-[0.4em]" autoFocus />
            </Field>
          </div>
        )
      )}
    </Modal>
  );
}

function TwoFactorDisable({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Turn off two-factor authentication"
      footer={
        <Button
          variant="danger"
          loading={busy}
          disabled={!pw || code.length < 6}
          onClick={async () => {
            setBusy(true);
            try {
              await api.post('/me/2fa/disable', { password: pw, code });
              toast.success('Two-factor authentication disabled');
              qc.invalidateQueries({ queryKey: ['me'] });
              onClose();
            } catch (e) {
              handleError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Turn off
        </Button>
      }
    >
      <Alert tone="warning" className="mb-4">
        Your account will be less secure.
      </Alert>
      <div className="space-y-4">
        <Field label="Password">
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <Field label="Authenticator or backup code">
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
