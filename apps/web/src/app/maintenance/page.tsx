'use client';

import { Button, Logo, fmtDateTime } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api } from '@/lib/api';

export default function Maintenance() {
  const router = useRouter();
  const { data, refetch, isFetching } = useQuery({
    queryKey: ['status'],
    queryFn: () => api.get<{ maintenanceMode: boolean; maintenanceMessage: string; maintenanceEta: string | null }>('/public/status'),
    refetchInterval: 20_000,
  });
  useEffect(() => {
    if (data && !data.maintenanceMode) router.replace('/app');
  }, [data, router]);
  return (
    <main className="grid min-h-screen place-items-center bg-navy-deep px-6 text-center text-white">
      <div className="max-w-lg">
        <Logo light className="justify-center" />
        <div className="mx-auto mt-12 grid h-20 w-20 place-items-center rounded-3xl bg-gold-sheen text-navy-900 shadow-gold">
          <Wrench className="h-9 w-9" />
        </div>
        <h1 className="mt-8 font-display text-4xl">We’re polishing the vault.</h1>
        <p className="mt-4 text-lg text-navy-200">{data?.maintenanceMessage ?? 'One Bank is undergoing scheduled maintenance.'}</p>
        {data?.maintenanceEta && <p className="mt-2 text-sm text-gold-300">Expected back by {fmtDateTime(data.maintenanceEta)}</p>}
        <p className="mt-6 text-sm text-navy-300">Your money is safe. Card freezes and security alerts continue to work as normal.</p>
        <Button variant="gold" className="mt-8" loading={isFetching} onClick={() => refetch()}>
          Check again
        </Button>
      </div>
    </main>
  );
}
