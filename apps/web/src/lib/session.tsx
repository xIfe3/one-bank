'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect } from 'react';
import { toast } from 'sonner';
import { API_URL, api, type Me } from './api';

const MeContext = createContext<Me | null>(null);

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error('useMe must be used inside the app shell');
  return me;
}

export function useMeQuery() {
  return useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/me'), staleTime: 30_000 });
}

export function MeProvider({ me, children }: { me: Me; children: React.ReactNode }) {
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

/**
 * Subscribes to the API's SSE stream; new notifications toast + refresh lists,
 * balance events refresh account/transaction queries.
 */
export function useLiveUpdates(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      es = new EventSource(`${API_URL}/me/stream`, { withCredentials: true });
      es.addEventListener('notification', (e) => {
        const n = JSON.parse((e as MessageEvent).data) as { title: string; body: string; category: string };
        toast(n.title, { description: n.body });
        qc.invalidateQueries({ queryKey: ['notifications'] });
        if (n.category === 'SECURITY') qc.invalidateQueries({ queryKey: ['me'] });
        if (n.category === 'SUPPORT') qc.invalidateQueries({ queryKey: ['tickets'] });
      });
      es.addEventListener('balance', () => {
        ['accounts', 'dashboard', 'transactions', 'cards', 'savings', 'loans', 'transaction', 'limits'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      });
      es.onerror = () => {
        es?.close();
        // Access token may have expired: refresh happens on the next API call; reconnect shortly.
        retry = setTimeout(() => {
          api.get('/me').catch(() => undefined).finally(connect);
        }, 5000);
      };
    };
    connect();
    return () => {
      clearTimeout(retry);
      es?.close();
    };
  }, [enabled, qc]);
}
