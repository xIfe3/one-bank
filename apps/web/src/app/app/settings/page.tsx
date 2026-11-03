'use client';

import { updateProfileSchema } from '@onebank/shared';
import { Alert, Button, Card, CardHeader, Field, Input, KeyValue, Modal, Textarea, fmtDate } from '@onebank/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { handleError, useZodForm } from '@/lib/form';
import { useMe } from '@/lib/session';

export default function Profile() {
  const me = useMe();
  const qc = useQueryClient();
  const router = useRouter();
  const form = useZodForm(updateProfileSchema, {
    firstName: me.firstName,
    lastName: me.lastName,
    phone: me.phone,
    addressLine1: me.addressLine1,
    city: me.city,
    state: me.state,
    postalCode: me.postalCode,
    tag: me.tag ?? '',
  });
  const [closing, setClosing] = useState(false);
  const [pw, setPw] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const v = form.values as Record<string, string>;
  const field = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} error={form.errors[k]}>
      <Input value={v[k] ?? ''} onChange={form.set(k)} {...props} />
    </Field>
  );
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader title="Personal details" />
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            form.submit(async (d) => {
              await api.patch('/me', { ...d, tag: d.tag || undefined });
              toast.success('Profile updated');
              qc.invalidateQueries({ queryKey: ['me'] });
            });
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field('firstName', 'First name')}
            {field('lastName', 'Last name')}
          </div>
          <Field label="One Bank @tag" error={form.errors.tag}><Input value={v.tag ?? ''} onChange={form.set('tag')} placeholder="yourname" prefix="@" /></Field>
          {field('phone', 'Phone number', { type: 'tel' })}
          {field('addressLine1', 'Street address')}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {field('city', 'City')}
            {field('state', 'State')}
            {field('postalCode', 'Postal code')}
          </div>
          <Button type="submit" loading={form.busy}>
            Save changes
          </Button>
        </form>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader title="Account" />
          <KeyValue
            items={[
              ['Email', me.email],
              ['Date of birth', fmtDate(me.dateOfBirth)],
              ['Country', me.country],
              ['Base currency', me.baseCurrency],
              ['Member since', fmtDate(me.createdAt)],
              ['Customer ID', <span key="i" className="font-mono text-xs">{me.id}</span>],
            ]}
          />
          <p className="mt-3 text-xs text-navy-400">To change your email, go to the Security tab. To correct your date of birth, contact support.</p>
        </Card>
        <Card className="border-red-100">
          <CardHeader title="Close account" subtitle="Permanently close your One Bank account." />
          <Button variant="outline" className="border-red-200 text-danger" onClick={() => setClosing(true)}>
            Close my account
          </Button>
        </Card>
      </div>
      <Modal
        open={closing}
        onClose={() => setClosing(false)}
        title="Close your account?"
        footer={
          <Button
            variant="danger"
            loading={busy}
            disabled={!pw}
            onClick={async () => {
              setBusy(true);
              try {
                await api.post('/me/close-account', { password: pw, reason });
                toast.success('Your account has been closed.');
                qc.clear();
                router.replace('/');
              } catch (e) {
                handleError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            Close account permanently
          </Button>
        }
      >
        <Alert tone="warning" className="mb-4">
          All balances — including savings goals and cards — must be zero, and you must not have an active loan.
        </Alert>
        <div className="space-y-4">
          <Field label="Why are you leaving? (optional)">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="Confirm your password">
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
