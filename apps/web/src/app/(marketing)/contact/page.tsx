'use client';

import { contactSchema } from '@onebank/shared';
import { Button, Field, Input, Textarea } from '@onebank/ui';
import { CheckCircle2, Clock, Mail, MapPin, Phone } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

function ContactForm() {
  const params = useSearchParams();
  const topic = params.get('topic');
  const role = params.get('role');
  const [form, setForm] = useState({
    name: '',
    email: '',
    subject: role ? `Application: ${role}` : topic === 'fraud' ? 'Reporting suspected fraud' : topic === 'press' ? 'Media enquiry' : '',
    message: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = contactSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, v?.[0] ?? ''])));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await api.post('/public/contact', parsed.data);
      setDone(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="flex flex-col items-center rounded-3xl border border-navy-100 bg-white p-10 text-center">
        <CheckCircle2 className="h-12 w-12 text-success" />
        <h2 className="mt-4 font-serif text-2xl text-navy-800">Message sent</h2>
        <p className="mt-2 text-navy-500">Thanks, {form.name.split(' ')[0]}. We have emailed you a confirmation and will reply within one business day.</p>
      </div>
    );

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl border border-navy-100 bg-white p-8 shadow-card" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errors.name}>
          <Input value={form.name} onChange={set('name')} autoComplete="name" />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" value={form.email} onChange={set('email')} autoComplete="email" />
        </Field>
      </div>
      <Field label="Subject" error={errors.subject}>
        <Input value={form.subject} onChange={set('subject')} />
      </Field>
      <Field label="Message" error={errors.message}>
        <Textarea rows={6} value={form.message} onChange={set('message')} />
      </Field>
      <Button type="submit" variant="gold" size="lg" loading={busy}>
        Send message
      </Button>
      <p className="text-xs text-navy-400">Never include your password, PIN or card details in a message.</p>
    </form>
  );
}

export default function Contact() {
  return (
    <section className="container-x pb-24 pt-36">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <p className="eyebrow">Contact</p>
          <h1 className="h-display mt-4 text-navy-800">We’re here to help.</h1>
          <p className="mt-5 text-lg text-navy-500">Existing members get the fastest answers through in-app support tickets. For everything else, send us a message.</p>
          <ul className="mt-10 space-y-5 text-navy-700">
            {[
              [<Phone key="p" className="h-5 w-5" />, '+1 (800) 555-0101', 'Mon–Fri, 8am–8pm ET'],
              [<Mail key="m" className="h-5 w-5" />, 'hello@onebank.test', 'We reply within one business day'],
              [<MapPin key="a" className="h-5 w-5" />, '1 Gold Street, New York, NY 10004', 'Also in London and Lagos'],
              [<Clock key="c" className="h-5 w-5" />, '24/7 card freeze', 'Freeze cards instantly in the app'],
            ].map(([icon, t, s]) => (
              <li key={t as string} className="flex gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-navy-800 text-gold-300">{icon}</span>
                <div>
                  <p className="font-semibold">{t}</p>
                  <p className="text-sm text-navy-400">{s}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <Suspense>
          <ContactForm />
        </Suspense>
      </div>
    </section>
  );
}
