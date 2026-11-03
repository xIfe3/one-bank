'use client';

import { Alert, ApiError, Button, Field, Input, KeyValue, Modal, PinInput } from '@onebank/ui';
import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useMe } from '@/lib/session';

export interface ConfirmRequest {
  title: string;
  summary: [React.ReactNode, React.ReactNode][];
  confirmLabel?: string;
  /** Called with PIN (and OTP if the API asked for one). Throw ApiError to show it. */
  run: (auth: { pin: string; otp?: string }) => Promise<void>;
}

/**
 * Money-action confirmation: shows a summary, collects the transaction PIN and, when
 * the API answers TWO_FACTOR_REQUIRED, a one-time code (authenticator or emailed).
 */
export function ConfirmMoney({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const me = useMe();
  const [pin, setPin] = useState('');
  const [otp, setOtp] = useState('');
  const [needOtp, setNeedOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const close = () => {
    setPin('');
    setOtp('');
    setNeedOtp(false);
    setError(null);
    onClose();
  };

  if (!request) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await request.run({ pin, otp: needOtp ? otp : undefined });
      close();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'TWO_FACTOR_REQUIRED') {
        setNeedOtp(true);
        if (!me.twoFactorEnabled) await sendCode();
      } else if (e instanceof ApiError && (e.code === 'INVALID_PIN' || e.code === 'PIN_LOCKED')) {
        setPin('');
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : 'Something went wrong');
      }
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    setSending(true);
    try {
      await api.post('/me/otp');
      toast.success('We emailed you a 6-digit verification code.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      title={request.title}
      subtitle="Review the details and confirm with your PIN."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="gold" onClick={submit} loading={busy} disabled={pin.length !== 4 || (needOtp && otp.length < 6) || !me.hasPin}>
            {request.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      <KeyValue items={request.summary} />
      {!me.hasPin ? (
        <Alert tone="warning" className="mt-5" title="Set up your transaction PIN" action={<Link href="/app/settings/security"><Button size="sm">Set PIN</Button></Link>}>
          You need a 4-digit PIN to approve payments.
        </Alert>
      ) : (
        <div className="mt-6 space-y-5">
          <div>
            <p className="mb-3 text-center text-sm font-medium text-navy-600">Enter your transaction PIN</p>
            <PinInput value={pin} onChange={setPin} autoFocus />
          </div>
          {needOtp && (
            <div className="rounded-2xl border border-gold-200 bg-gold-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-navy-800">
                <ShieldCheck className="h-4 w-4 text-gold-600" /> Extra verification required
              </p>
              <p className="mt-1 text-xs text-navy-500">
                {me.twoFactorEnabled ? 'Enter the code from your authenticator app, or request an email code.' : 'Enter the 6-digit code we emailed you.'}
              </p>
              <Field className="mt-3">
                <Input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" inputMode="numeric" className="text-center text-lg tracking-[0.4em]" autoFocus />
              </Field>
              <button type="button" onClick={sendCode} disabled={sending} className="mt-2 text-xs font-semibold text-gold-700 hover:underline disabled:opacity-50">
                {sending ? 'Sending…' : 'Email me a code'}
              </button>
            </div>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
      )}
    </Modal>
  );
}

export function useConfirmMoney() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  return { request, confirm: setRequest, close: () => setRequest(null), dialog: <ConfirmMoney request={request} onClose={() => setRequest(null)} /> };
}
