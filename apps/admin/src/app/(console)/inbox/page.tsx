'use client';

import { Badge, Button, Card, CardHeader, PageHeader, Table, Tabs, Td, fmtDateTime } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';

interface Msg {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  handled: boolean;
  createdAt: string;
}

export default function Inbox() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'contact' | 'subscribers'>('contact');
  const { data: msgs } = useQuery({ queryKey: ['contact'], queryFn: () => api.get<Msg[]>('/admin/contact-messages') });
  const { data: subs } = useQuery({ queryKey: ['subs'], queryFn: () => api.get<{ id: string; email: string; createdAt: string }[]>('/admin/subscribers'), enabled: tab === 'subscribers' });
  return (
    <>
      <PageHeader title="Website inbox" subtitle="Messages from the contact form and newsletter sign-ups." />
      <Tabs
        className="mb-6 w-fit"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'contact', label: 'Contact messages', count: msgs?.filter((m) => !m.handled).length },
          { value: 'subscribers', label: 'Newsletter' },
        ]}
      />
      {tab === 'contact' ? (
        <div className="space-y-4">
          {msgs?.map((m) => (
            <Card key={m.id} className={m.handled ? 'opacity-70' : ''}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-navy-800">{m.subject}</p>
                  <p className="text-xs text-navy-400">
                    {m.name} · <a href={`mailto:${m.email}`} className="underline">{m.email}</a> · {fmtDateTime(m.createdAt)}
                  </p>
                </div>
                {m.handled ? (
                  <Badge tone="success">Handled</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await api.post(`/admin/contact-messages/${m.id}/handled`);
                      qc.invalidateQueries({ queryKey: ['contact'] });
                    }}
                  >
                    Mark handled
                  </Button>
                )}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-navy-700">{m.message}</p>
            </Card>
          ))}
          {!msgs?.length && <Card><p className="py-8 text-center text-sm text-navy-400">No messages yet.</p></Card>}
        </div>
      ) : (
        <Card>
          <CardHeader
            title={`${subs?.length ?? 0} subscribers`}
            action={
              <Button
                size="sm"
                variant="outline"
                icon={<Download className="h-4 w-4" />}
                onClick={() => {
                  const csv = ['email,subscribed_at', ...(subs ?? []).map((s) => `${s.email},${s.createdAt}`)].join('\n');
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
                  a.download = 'onebank-subscribers.csv';
                  a.click();
                }}
              >
                Export CSV
              </Button>
            }
          />
          <Table head={['Email', 'Subscribed']}>
            {subs?.map((s) => (
              <tr key={s.id}>
                <Td>{s.email}</Td>
                <Td>{fmtDateTime(s.createdAt)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
