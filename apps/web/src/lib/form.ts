'use client';

import { ApiError } from '@onebank/ui';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ZodTypeAny, z } from 'zod';

/** Tiny form helper: zod validation on submit + API error mapping to fields/toast. */
export function useZodForm<S extends ZodTypeAny>(schema: S, initial: Partial<z.input<S>>) {
  const [values, setValues] = useState<Record<string, unknown>>(initial as Record<string, unknown>);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> | string | number | boolean) => {
    const v = typeof e === 'object' && e !== null && 'target' in e ? (e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value) : e;
    setValues((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: '' }));
  };

  function validate(only?: string[]): z.infer<S> | null {
    const r = schema.safeParse(values);
    if (r.success) {
      setErrors({});
      return r.data;
    }
    const fe = r.error.flatten().fieldErrors as Record<string, string[] | undefined>;
    const mapped = Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v?.[0] ?? '']));
    if (only) {
      const sub = Object.fromEntries(Object.entries(mapped).filter(([k]) => only.includes(k)));
      setErrors(sub);
      return Object.keys(sub).length ? null : (values as z.infer<S>);
    }
    setErrors(mapped);
    return null;
  }

  async function submit<T>(fn: (data: z.infer<S>) => Promise<T>): Promise<T | undefined> {
    const data = validate();
    if (!data) return;
    setBusy(true);
    try {
      return await fn(data);
    } catch (e) {
      handleError(e, setErrors);
    } finally {
      setBusy(false);
    }
  }

  return { values, setValues, set, errors, setErrors, busy, setBusy, validate, submit };
}

export function handleError(e: unknown, setErrors?: (e: Record<string, string>) => void) {
  if (e instanceof ApiError && e.code === 'VALIDATION' && e.details && setErrors) {
    const d = e.details as Record<string, string[]>;
    setErrors(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v?.[0] ?? ''])));
  }
  toast.error(e instanceof Error ? e.message : 'Something went wrong');
}

export function passwordStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
  return { score, label: labels[score] };
}
