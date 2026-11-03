'use client';

import { CURRENCIES, CURRENCY_META, signupSchema } from '@onebank/shared';
import { Button, CurrencyFlag, Field, Input, Select, cn } from '@onebank/ui';
import { Check, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api } from '@/lib/api';
import { passwordStrength, useZodForm } from '@/lib/form';

const COUNTRIES: [string, string][] = [
  ['US', 'United States'],
  ['GB', 'United Kingdom'],
  ['NG', 'Nigeria'],
  ['DE', 'Germany'],
  ['FR', 'France'],
  ['CA', 'Canada'],
  ['IE', 'Ireland'],
  ['NL', 'Netherlands'],
  ['ES', 'Spain'],
  ['IT', 'Italy'],
  ['GH', 'Ghana'],
  ['KE', 'Kenya'],
  ['ZA', 'South Africa'],
  ['AE', 'United Arab Emirates'],
];

const STEPS = [
  { title: 'Your account', fields: ['email', 'password', 'firstName', 'lastName', 'phone', 'country'] },
  { title: 'About you', fields: ['dateOfBirth', 'addressLine1', 'city', 'state', 'postalCode'] },
  { title: 'Finish', fields: ['baseCurrency', 'acceptTerms', 'referralCode'] },
];

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);
  const form = useZodForm(signupSchema, {
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    country: 'US',
    dateOfBirth: '' as unknown as Date,
    addressLine1: '',
    city: '',
    state: '',
    postalCode: '',
    baseCurrency: 'USD',
    referralCode: params.get('ref') ?? '',
    acceptTerms: false as unknown as true,
  });
  const v = form.values as Record<string, string | boolean>;
  const strength = passwordStrength(String(v.password ?? ''));

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 2) {
      if (form.validate(STEPS[step].fields)) setStep(step + 1);
      return;
    }
    form.submit(async (data) => {
      await api.post('/auth/signup', { ...data, referralCode: data.referralCode || undefined });
      router.push(`/check-email?email=${encodeURIComponent(data.email)}`);
    });
  };

  const text = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} error={form.errors[k]} htmlFor={k}>
      <Input id={k} value={String(v[k] ?? '')} onChange={form.set(k)} invalid={!!form.errors[k]} {...props} />
    </Field>
  );

  return (
    <form onSubmit={next} className="space-y-5" noValidate>
      <div>
        <h1 className="font-display text-3xl text-navy-800">Open your account</h1>
        <p className="mt-2 text-navy-500">It takes about three minutes.</p>
      </div>
      <ol className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-1 items-center gap-2">
            <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold', i < step ? 'bg-success text-white' : i === step ? 'bg-navy-800 text-gold-300' : 'bg-navy-100 text-navy-400')}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn('hidden text-xs font-semibold sm:inline', i === step ? 'text-navy-800' : 'text-navy-400')}>{s.title}</span>
            {i < 2 && <span className="h-px flex-1 bg-navy-100" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {text('firstName', 'First name', { autoComplete: 'given-name' })}
            {text('lastName', 'Last name', { autoComplete: 'family-name' })}
          </div>
          {text('email', 'Email address', { type: 'email', autoComplete: 'email' })}
          <Field label="Password" error={form.errors.password} htmlFor="password" hint="At least 10 characters with upper & lower case letters and a number.">
            <div className="relative">
              <Input id="password" type={show ? 'text' : 'password'} autoComplete="new-password" value={String(v.password ?? '')} onChange={form.set('password')} invalid={!!form.errors.password} className="pr-11" />
              <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-3 text-navy-400" aria-label="Toggle password visibility">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {String(v.password ?? '').length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <div className="flex flex-1 gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className={cn('h-1.5 flex-1 rounded-full', i < strength.score ? (strength.score >= 4 ? 'bg-success' : strength.score >= 3 ? 'bg-gold-500' : 'bg-danger') : 'bg-navy-100')} />
                  ))}
                </div>
                <span className="text-xs font-medium text-navy-500">{strength.label}</span>
              </div>
            )}
          </Field>
          <div className="grid grid-cols-[1fr_1.2fr] gap-3">
            <Field label="Country" error={form.errors.country}>
              <Select value={String(v.country)} onChange={form.set('country')}>
                {COUNTRIES.map(([c, n]) => (
                  <option key={c} value={c}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
            {text('phone', 'Phone number', { type: 'tel', autoComplete: 'tel', placeholder: '+1 555 000 0000' })}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          {text('dateOfBirth', 'Date of birth', { type: 'date', max: new Date(Date.now() - 18 * 365.25 * 864e5).toISOString().slice(0, 10) })}
          {text('addressLine1', 'Street address', { autoComplete: 'street-address' })}
          <div className="grid grid-cols-2 gap-3">
            {text('city', 'City', { autoComplete: 'address-level2' })}
            {text('state', 'State / region', { autoComplete: 'address-level1' })}
          </div>
          {text('postalCode', 'Postal code', { autoComplete: 'postal-code' })}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <Field label="Main account currency" error={form.errors.baseCurrency}>
            <div className="grid grid-cols-2 gap-3">
              {CURRENCIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => form.set('baseCurrency')(c)}
                  className={cn('flex items-center gap-3 rounded-2xl border p-3 text-left transition', v.baseCurrency === c ? 'border-gold-500 bg-gold-50 ring-4 ring-gold-100' : 'border-navy-100 bg-white hover:border-navy-300')}
                >
                  <CurrencyFlag currency={c} />
                  <span>
                    <span className="block text-sm font-semibold text-navy-800">{c}</span>
                    <span className="block text-xs text-navy-400">{CURRENCY_META[c].name}</span>
                  </span>
                </button>
              ))}
            </div>
          </Field>
          {text('referralCode', 'Referral code (optional)')}
          <Field error={form.errors.acceptTerms}>
            <label className="flex items-start gap-3 text-sm text-navy-600">
              <input type="checkbox" checked={!!v.acceptTerms} onChange={form.set('acceptTerms')} className="mt-0.5 h-4 w-4 accent-[#0B1B3F]" />
              <span>
                I agree to the{' '}
                <Link href="/legal/terms" target="_blank" className="font-semibold text-navy-800 underline">
                  Terms
                </Link>{' '}
                and{' '}
                <Link href="/legal/privacy" target="_blank" className="font-semibold text-navy-800 underline">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
          </Field>
        </div>
      )}

      <div className="flex gap-3">
        {step > 0 && (
          <Button type="button" variant="outline" size="lg" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        <Button type="submit" variant={step === 2 ? 'gold' : 'primary'} size="lg" block loading={form.busy}>
          {step === 2 ? 'Create my account' : 'Continue'}
        </Button>
      </div>
      <p className="text-center text-sm text-navy-500">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-navy-800 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
