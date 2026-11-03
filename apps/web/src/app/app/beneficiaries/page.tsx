'use client';

import { Avatar, Badge, Button, Card, EmptyState, Input, PageHeader, Skeleton, Tabs, fmtDate } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Search, Send, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { handleError } from '@/lib/form';

interface Beneficiary {
  id: string;
  type: 'INTERNAL' | 'INTERBANK' | 'WIRE';
  nickname: string | null;
  name: string;
  accountNumber: string;
  bankName: string | null;
  swiftCode: string | null;
  lastUsedAt: string | null;
}

export default function Beneficiaries() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['beneficiaries'], queryFn: () => api.get<Beneficiary[]>('/transfers/beneficiaries') });
  const [tab, setTab] = useState<'ALL' | Beneficiary['type']>('ALL');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [nick, setNick] = useState('');
  const list = (data ?? []).filter((b) => (tab === 'ALL' || b.type === tab) && (!q || `${b.name} ${b.nickname} ${b.accountNumber}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <PageHeader title="Beneficiaries" subtitle="People and businesses you pay regularly." actions={<Link href="/app/transfer"><Button variant="gold" icon={<Send className="h-4 w-4" />}>New transfer</Button></Link>} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'ALL', label: 'All', count: data?.length },
            { value: 'INTERNAL', label: 'One Bank' },
            { value: 'INTERBANK', label: 'Other banks' },
            { value: 'WIRE', label: 'International' },
          ]}
        />
        <div className="w-full sm:w-72">
          <Input prefix={<Search className="h-4 w-4" />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search beneficiaries" />
        </div>
      </div>
      <Card>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : list.length ? (
          <div className="divide-y divide-navy-50">
            {list.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-4 py-4">
                <Avatar name={b.name} className="h-11 w-11" />
                <div className="min-w-0 flex-1">
                  {editing === b.id ? (
                    <form
                      className="flex gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          await api.patch(`/transfers/beneficiaries/${b.id}`, { nickname: nick });
                          qc.invalidateQueries({ queryKey: ['beneficiaries'] });
                          setEditing(null);
                        } catch (err) {
                          handleError(err);
                        }
                      }}
                    >
                      <Input value={nick} onChange={(e) => setNick(e.target.value)} autoFocus className="h-9" />
                      <Button size="sm">Save</Button>
                    </form>
                  ) : (
                    <p className="font-semibold text-navy-800">
                      {b.nickname ?? b.name} {b.nickname && <span className="text-sm font-normal text-navy-400">({b.name})</span>}
                    </p>
                  )}
                  <p className="text-sm text-navy-400">
                    {b.bankName ?? 'One Bank'} · {b.accountNumber}
                    {b.swiftCode && ` · ${b.swiftCode}`}
                    {b.lastUsedAt && ` · last paid ${fmtDate(b.lastUsedAt)}`}
                  </p>
                </div>
                <Badge tone={b.type === 'INTERNAL' ? 'gold' : b.type === 'WIRE' ? 'info' : 'neutral'}>{b.type === 'INTERNAL' ? 'One Bank' : b.type === 'WIRE' ? 'International' : 'Bank'}</Badge>
                <div className="flex gap-1">
                  {b.type !== 'WIRE' && (
                    <Link href={b.type === 'INTERNAL' ? `/app/transfer?to=${b.accountNumber}` : '/app/transfer?kind=INTERBANK'}>
                      <Button size="sm" variant="secondary" icon={<Send className="h-3.5 w-3.5" />}>
                        Pay
                      </Button>
                    </Link>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Rename"
                    onClick={() => {
                      setEditing(b.id);
                      setNick(b.nickname ?? '');
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Delete"
                    onClick={async () => {
                      try {
                        await api.del(`/transfers/beneficiaries/${b.id}`);
                        toast.success('Beneficiary removed');
                        qc.invalidateQueries({ queryKey: ['beneficiaries'] });
                      } catch (e) {
                        handleError(e);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-danger" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No beneficiaries yet" body="Tick “Save as beneficiary” when you send money to add people here." />
        )}
      </Card>
    </>
  );
}
