'use client';

import { Suspense, useCallback } from 'react';
import { TokenAction } from '@/components/token-action';
import { api } from '@/lib/api';

export default function VerifyEmail() {
  const run = useCallback((token: string) => api.post('/auth/verify-email', { token }), []);
  return (
    <Suspense>
      <TokenAction run={run} successTitle="Email verified 🎉" successBody="Your account is active and your first account number is ready. Sign in to get started." cta={{ href: '/login', label: 'Sign in' }} />
    </Suspense>
  );
}
