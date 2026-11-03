'use client';

import { Button } from '@onebank/ui';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

function CheckEmail() {
  const email = useSearchParams().get('email') ?? '';
  const [cooldown, setCooldown] = useState(60);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gold-sheen text-navy-900 shadow-gold">
        <MailCheck className="h-7 w-7" />
      </div>
      <div>
        <h1 className="font-display text-3xl text-navy-800">Check your inbox</h1>
        <p className="mt-3 text-navy-500">
          We sent a verification link to <span className="font-semibold text-navy-800">{email || 'your email'}</span>. Click it to activate your account. The link expires in 24 hours.
        </p>
      </div>
      <Button
        variant="outline"
        block
        loading={busy}
        disabled={cooldown > 0 || !email}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api.post<{ message: string }>('/auth/resend-verification', { email });
            toast.success(r.message);
            setCooldown(60);
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {cooldown > 0 ? `Resend link in ${cooldown}s` : 'Resend verification email'}
      </Button>
      <p className="text-sm text-navy-500">
        Wrong address?{' '}
        <Link href="/signup" className="font-semibold text-navy-800 underline">
          Start again
        </Link>{' '}
        ·{' '}
        <Link href="/login" className="font-semibold text-navy-800 underline">
          Sign in
        </Link>
      </p>
      {process.env.NODE_ENV === 'development' && <p className="rounded-2xl bg-navy-50 p-3 text-xs text-navy-500">Local development: open the mail catcher at http://localhost:8026 to see the email.</p>}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <CheckEmail />
    </Suspense>
  );
}
