'use client';

import { Suspense, useCallback } from 'react';
import { TokenAction } from '@/components/token-action';
import { api } from '@/lib/api';

export default function ConfirmEmail() {
  const run = useCallback((token: string) => api.post('/auth/confirm-email-change', { token }), []);
  return (
    <Suspense>
      <TokenAction run={run} successTitle="Email address updated" successBody="Use your new email address the next time you sign in." cta={{ href: '/app/settings', label: 'Back to settings' }} />
    </Suspense>
  );
}
