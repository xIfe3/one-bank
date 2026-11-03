'use client';

import { Button, Spinner } from '@onebank/ui';
import { CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/** Runs a one-shot token action from ?token= and renders success / failure. */
export function TokenAction({
  run,
  successTitle,
  successBody,
  cta,
}: {
  run: (token: string) => Promise<unknown>;
  successTitle: string;
  successBody: string;
  cta: { href: string; label: string };
}) {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setState('error');
      setMessage('This link is missing its token.');
      return;
    }
    run(token)
      .then(() => setState('ok'))
      .catch((e: Error) => {
        setState('error');
        setMessage(e.message);
      });
  }, [token, run]);

  if (state === 'loading')
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-navy-500">
        <Spinner className="h-8 w-8" /> Verifying…
      </div>
    );
  return (
    <div className="space-y-6 text-center">
      {state === 'ok' ? <CheckCircle2 className="mx-auto h-14 w-14 text-success" /> : <XCircle className="mx-auto h-14 w-14 text-danger" />}
      <div>
        <h1 className="font-display text-3xl text-navy-800">{state === 'ok' ? successTitle : 'This link didn’t work'}</h1>
        <p className="mt-3 text-navy-500">{state === 'ok' ? successBody : message}</p>
      </div>
      <Link href={state === 'ok' ? cta.href : '/login'}>
        <Button variant="primary" size="lg" block>
          {state === 'ok' ? cta.label : 'Back to sign in'}
        </Button>
      </Link>
    </div>
  );
}
