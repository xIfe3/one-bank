'use client';

import { loginSchema } from '@onebank/shared';
import { Alert, ApiError, Button, Field, Input } from '@onebank/ui';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useZodForm } from '@/lib/form';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const safeNext = next && next.startsWith('/app') ? next : '/app';
  const form = useZodForm(loginSchema, { email: '', password: '', rememberMe: true });
  const [show, setShow] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [unverified, setUnverified] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUnverified(null);
    form.submit(async (data) => {
      try {
        const r = await api.post<{ twoFactorRequired: boolean; challengeToken?: string; user?: { firstName: string } }>('/auth/login', data);
        if (r.twoFactorRequired) setChallenge(r.challengeToken!);
        else {
          toast.success(`Welcome back, ${r.user?.firstName}`);
          router.replace(safeNext);
        }
      } catch (err) {
        if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
          setUnverified(data.email);
          return;
        }
        throw err;
      }
    });
  };

  const onTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    form.setBusy(true);
    try {
      const r = await api.post<{ user: { firstName: string } }>('/auth/login/2fa', { challengeToken: challenge, code });
      toast.success(`Welcome back, ${r.user.firstName}`);
      router.replace(safeNext);
    } catch (err) {
      toast.error((err as Error).message);
      if (err instanceof ApiError && err.code === 'INVALID_TOKEN') setChallenge(null);
    } finally {
      form.setBusy(false);
    }
  };

  if (challenge) {
    return (
      <form onSubmit={onTwoFactor} className="space-y-6">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-navy-800 text-gold-300">
          <KeyRound className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-3xl text-navy-800">Two-factor authentication</h1>
          <p className="mt-2 text-navy-500">Enter the 6-digit code from your authenticator app, or one of your backup codes.</p>
        </div>
        <Field label="Authentication code">
          <Input autoFocus inputMode="text" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" className="text-center text-xl tracking-[0.4em]" />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={form.busy} disabled={code.length < 6}>
          Verify and sign in
        </Button>
        <button type="button" onClick={() => setChallenge(null)} className="w-full text-sm font-medium text-navy-500 hover:text-navy-800">
          ← Use a different account
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <h1 className="font-display text-3xl text-navy-800">Welcome back</h1>
        <p className="mt-2 text-navy-500">Sign in to your One Bank account.</p>
      </div>
      {params.get('expired') && <Alert tone="warning">Your session expired. Please sign in again.</Alert>}
      {params.get('reset') && <Alert tone="success">Password updated. Sign in with your new password.</Alert>}
      {unverified && (
        <Alert tone="warning" title="Please verify your email">
          We sent a new verification link to {unverified}.{' '}
          <Link href={`/check-email?email=${encodeURIComponent(unverified)}`} className="font-semibold underline">
            Didn’t get it?
          </Link>
        </Alert>
      )}
      <Field label="Email address" error={form.errors.email} htmlFor="email">
        <Input id="email" type="email" autoComplete="email" value={String(form.values.email ?? '')} onChange={form.set('email')} invalid={!!form.errors.email} />
      </Field>
      <Field
        label={
          <span className="flex justify-between">
            Password
            <Link href="/forgot-password" className="text-xs font-semibold text-gold-700 hover:text-gold-800">
              Forgot password?
            </Link>
          </span>
        }
        error={form.errors.password}
        htmlFor="password"
      >
        <div className="relative">
          <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={String(form.values.password ?? '')} onChange={form.set('password')} invalid={!!form.errors.password} className="pr-11" />
          <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-3 text-navy-400 hover:text-navy-700" aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>
      <label className="flex items-center gap-2 text-sm text-navy-600">
        <input type="checkbox" checked={!!form.values.rememberMe} onChange={form.set('rememberMe')} className="h-4 w-4 rounded accent-[#0B1B3F]" /> Keep me signed in for 30 days
      </label>
      <Button type="submit" variant="primary" size="lg" block loading={form.busy}>
        Sign in
      </Button>
      <p className="text-center text-sm text-navy-500">
        New to One Bank?{' '}
        <Link href="/signup" className="font-semibold text-navy-800 hover:underline">
          Open an account
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
