'use client';

import { Badge, fmtDateTime } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Wrench, XCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface Status {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  maintenanceEta: string | null;
  features: Record<string, boolean>;
}

const LABELS: Record<string, string> = {
  signups: 'Account opening',
  deposits: 'Add money',
  internalTransfers: 'Transfers between members',
  interbank: 'Domestic bank transfers',
  wire: 'International wires',
  bills: 'Bill payments',
  cards: 'Virtual cards',
  loans: 'Loans',
  fx: 'Currency exchange',
  savings: 'Savings & deposits',
};

export default function StatusPage() {
  const { data, isLoading, isError, dataUpdatedAt } = useQuery({ queryKey: ['status'], queryFn: () => api.get<Status>('/public/status'), refetchInterval: 30_000 });
  const allUp = data && !data.maintenanceMode && Object.values(data.features).every(Boolean);
  return (
    <section className="container-x max-w-3xl pb-24 pt-36">
      <p className="eyebrow">System status</p>
      <h1 className="h-display mt-4 text-navy-800">Service status</h1>
      <div className={`mt-10 flex items-center gap-4 rounded-3xl p-6 ${isError ? 'bg-red-50' : data?.maintenanceMode ? 'bg-amber-50' : allUp ? 'bg-emerald-50' : 'bg-amber-50'}`}>
        {isError ? <XCircle className="h-8 w-8 text-danger" /> : data?.maintenanceMode ? <Wrench className="h-8 w-8 text-warning" /> : <CheckCircle2 className="h-8 w-8 text-success" />}
        <div>
          <p className="font-serif text-xl text-navy-800">
            {isLoading ? 'Checking…' : isError ? 'We are having trouble reaching our systems' : data?.maintenanceMode ? 'Scheduled maintenance in progress' : allUp ? 'All systems operational' : 'Some services are temporarily unavailable'}
          </p>
          {data?.maintenanceMode && <p className="mt-1 text-sm text-navy-600">{data.maintenanceMessage}</p>}
          {data?.maintenanceEta && <p className="mt-1 text-sm text-navy-600">Expected back: {fmtDateTime(data.maintenanceEta)}</p>}
        </div>
      </div>
      <div className="mt-8 divide-y divide-navy-100 rounded-3xl border border-navy-100 bg-white">
        {data &&
          Object.entries(data.features).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between px-6 py-4">
              <span className="text-navy-700">{LABELS[k] ?? k}</span>
              {data.maintenanceMode ? <Badge tone="warning">Maintenance</Badge> : v ? <Badge tone="success" dot>Operational</Badge> : <Badge tone="danger" dot>Unavailable</Badge>}
            </div>
          ))}
      </div>
      {dataUpdatedAt > 0 && <p className="mt-4 text-xs text-navy-400">Last checked {new Date(dataUpdatedAt).toLocaleTimeString()} · refreshes every 30 seconds</p>}
    </section>
  );
}
