'use client';

import { useRouter } from 'next/navigation';
import { Suspense, useCallback } from 'react';
import { TokenAction } from '@/components/token-action';
import { api } from '@/lib/api';

export default function SecureAccount() {
  const router = useRouter();
  const run = useCallback(
    async (token: string) => {
      const r = await api.post<{ resetToken: string }>('/auth/secure-account', { token });
      setTimeout(() => router.push(`/reset-password?token=${r.resetToken}&secured=1`), 1500);
    },
    [router],
  );
  return (
    <Suspense>
      <TokenAction run={run} successTitle="Account secured" successBody="We signed out every device and locked your password. Taking you to choose a new password…" cta={{ href: '/forgot-password', label: 'Choose a new password' }} />
    </Suspense>
  );
}
