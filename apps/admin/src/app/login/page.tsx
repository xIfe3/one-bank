'use client';

import { Alert, Button, Field, Input, Logo } from '@onebank/ui';
import { ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

type Step = { kind: 'password' } | { kind: 'code'; challengeToken: string } | { kind: 'setup'; challengeToken: string; qr: string; secret: string };

function Login() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ setupRequired?: boolean; twoFactorRequired?: boolean; challengeToken: string; qr?: string; secret?: string }>('/admin/auth/login', { email, password });
      setStep(r.setupRequired ? { kind: 'setup', challengeToken: r.challengeToken, qr: r.qr!, secret: r.secret! } : { kind: 'code', challengeToken: r.challengeToken });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step.kind === 'password') return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ admin: { firstName: string } }>('/admin/auth/login/2fa', { challengeToken: step.challengeToken, code });
      toast.success(`Welcome, ${r.admin.firstName}`);
      router.replace(next && next.startsWith('/') ? next : '/');
    } catch (err) {
      setError((err as Error).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-navy-deep px-4">
      <div className="w-full max-w-md animate-fade-up rounded-3xl bg-white p-8 shadow-lift">
        <div className="flex items-center justify-between">
          <Logo />
          <span className="rounded-full bg-navy-800 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-gold-300">Admin</span>
        </div>
        {step.kind === 'password' ? (
          <form onSubmit={submitPassword} className="mt-8 space-y-4">
            <div>
              <h1 className="font-display text-2xl text-navy-800">Staff sign in</h1>
              <p className="text-sm text-navy-400">Restricted area. All activity is audited.</p>
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            <Field label="Work email">
              <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </Field>
            <Field label="Password">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" block size="lg" loading={busy} disabled={!email || !password}>
              Continue
            </Button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="mt-8 space-y-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-navy-800 text-gold-300">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h1 className="font-display text-xl text-navy-800">{step.kind === 'setup' ? 'Set up two-factor authentication' : 'Two-factor authentication'}</h1>
                <p className="text-sm text-navy-400">{step.kind === 'setup' ? 'Required for all admin accounts.' : 'Enter the code from your authenticator app.'}</p>
              </div>
            </div>
            {step.kind === 'setup' && (
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-ivory p-4">
                <Image src={step.qr} alt="Scan with your authenticator app" width={190} height={190} unoptimized />
                <code className="break-all text-center text-xs text-navy-600">{step.secret}</code>
              </div>
            )}
            {error && <Alert tone="danger">{error}</Alert>}
            <Field label="6-digit code">
              <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="text-center text-xl tracking-[0.4em]" autoFocus />
            </Field>
            <Button type="submit" block size="lg" loading={busy} disabled={code.length !== 6}>
              Verify & sign in
            </Button>
            <button type="button" className="w-full text-sm text-navy-500" onClick={() => setStep({ kind: 'password' })}>
              ← Back
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
