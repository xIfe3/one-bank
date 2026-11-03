'use client';

import { forgotPasswordSchema } from '@onebank/shared';
import { Alert, Button, Field, Input } from '@onebank/ui';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useZodForm } from '@/lib/form';

export default function ForgotPassword() {
  const form = useZodForm(forgotPasswordSchema, { email: '' });
  const [sent, setSent] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.submit(async (d) => {
          const r = await api.post<{ message: string }>('/auth/forgot-password', d);
          setSent(r.message);
        });
      }}
      className="space-y-5"
      noValidate
    >
      <div>
        <h1 className="font-display text-3xl text-navy-800">Reset your password</h1>
        <p className="mt-2 text-navy-500">Enter your email and we’ll send you a secure link to choose a new password.</p>
      </div>
      {sent ? (
        <Alert tone="success" title="Check your inbox">
          {sent} The link expires in 30 minutes.
        </Alert>
      ) : (
        <>
          <Field label="Email address" error={form.errors.email}>
            <Input type="email" autoComplete="email" value={String(form.values.email ?? '')} onChange={form.set('email')} />
          </Field>
          <Button type="submit" variant="primary" size="lg" block loading={form.busy}>
            Send reset link
          </Button>
        </>
      )}
      <p className="text-center text-sm">
        <Link href="/login" className="font-semibold text-navy-800 hover:underline">
          ← Back to sign in
        </Link>
      </p>
    </form>
  );
}
