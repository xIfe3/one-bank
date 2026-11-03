'use client';

import { passwordSchema } from '@onebank/shared';
import { Alert, Button, Field, Input, cn } from '@onebank/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { z } from 'zod';
import { api } from '@/lib/api';
import { passwordStrength, useZodForm } from '@/lib/form';

const schema = z.object({ password: passwordSchema, confirm: z.string() }).refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

function Reset() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const router = useRouter();
  const form = useZodForm(schema, { password: '', confirm: '' });
  const pw = String(form.values.password ?? '');
  const s = passwordStrength(pw);
  if (!token) return <Alert tone="danger">This reset link is invalid. Please request a new one.</Alert>;
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        form.submit(async (d) => {
          await api.post('/auth/reset-password', { token, password: d.password });
          router.replace('/login?reset=1');
        });
      }}
    >
      <div>
        <h1 className="font-display text-3xl text-navy-800">Choose a new password</h1>
        <p className="mt-2 text-navy-500">For your security, all devices will be signed out.</p>
      </div>
      {params.get('secured') && <Alert tone="success">Your account is secured. Set a new password to sign back in.</Alert>}
      <Field label="New password" error={form.errors.password} hint="At least 10 characters with upper & lower case letters and a number.">
        <Input type="password" autoComplete="new-password" value={pw} onChange={form.set('password')} />
        {pw && (
          <div className="flex gap-1 pt-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={cn('h-1.5 flex-1 rounded-full', i < s.score ? (s.score >= 4 ? 'bg-success' : 'bg-gold-500') : 'bg-navy-100')} />
            ))}
          </div>
        )}
      </Field>
      <Field label="Confirm password" error={form.errors.confirm}>
        <Input type="password" autoComplete="new-password" value={String(form.values.confirm ?? '')} onChange={form.set('confirm')} />
      </Field>
      <Button type="submit" variant="primary" size="lg" block loading={form.busy}>
        Update password
      </Button>
    </form>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Reset />
    </Suspense>
  );
}
