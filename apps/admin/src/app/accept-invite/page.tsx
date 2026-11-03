'use client';

import { passwordSchema } from '@onebank/shared';
import { Alert, Button, Field, Input, Logo } from '@onebank/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

function Accept() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const issue = pw ? passwordSchema.safeParse(pw).error?.issues[0]?.message : undefined;
  return (
    <main className="grid min-h-screen place-items-center bg-navy-deep px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-lift">
        <Logo />
        <h1 className="mt-8 font-display text-2xl text-navy-800">Accept your invitation</h1>
        <p className="text-sm text-navy-400">Create a password. You’ll set up two-factor authentication when you first sign in.</p>
        {!token && <Alert tone="danger" className="mt-4">Invalid invitation link.</Alert>}
        {error && <Alert tone="danger" className="mt-4">{error}</Alert>}
        <div className="mt-6 space-y-4">
          <Field label="Password" error={issue}>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Field label="Confirm password" error={confirm && confirm !== pw ? 'Passwords do not match' : undefined}>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button
            block
            size="lg"
            loading={busy}
            disabled={!token || !pw || !!issue || pw !== confirm}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api.post('/admin/auth/accept-invite', { token, password: pw });
                toast.success('Password set. Please sign in.');
                router.replace('/login');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Activate account
          </Button>
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Accept />
    </Suspense>
  );
}
