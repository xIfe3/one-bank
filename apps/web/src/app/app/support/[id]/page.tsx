'use client';

import { Avatar, Badge, Button, Card, KeyValue, Skeleton, StatusBadge, Textarea, cn, fmtDateTime } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Paperclip, Send } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { handleError } from '@/lib/form';

interface Ticket {
  id: string;
  number: number;
  subject: string;
  category: string;
  priority: string;
  status: string;
  journalEntryId: string | null;
  createdAt: string;
  assignedAdmin: { firstName: string } | null;
  messages: { id: string; authorType: string; authorName: string; body: string; createdAt: string; attachments: { name: string; file: string }[] }[];
}

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: t, isLoading } = useQuery({ queryKey: ['tickets', id], queryFn: () => api.get<Ticket>(`/support/tickets/${id}`), refetchInterval: 20_000 });
  const [msg, setMsg] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  if (isLoading || !t) return <Skeleton className="h-96" />;
  const closed = t.status === 'CLOSED';

  const send = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('message', msg);
      files.forEach((f) => fd.append('files', f));
      await api.post(`/support/tickets/${id}/messages`, fd);
      setMsg('');
      setFiles([]);
      qc.invalidateQueries({ queryKey: ['tickets'] });
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/app/support" className="mb-4 inline-flex items-center gap-1 text-sm text-navy-500 hover:text-navy-800">
        <ArrowLeft className="h-4 w-4" /> All tickets
      </Link>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <Card>
          <div className="mb-6 flex items-start justify-between gap-4 border-b border-navy-50 pb-4">
            <div>
              <p className="text-xs font-semibold text-navy-400">Ticket #{t.number}</p>
              <h1 className="font-display text-xl text-navy-800">{t.subject}</h1>
            </div>
            <StatusBadge status={t.status} />
          </div>
          <div className="space-y-5">
            {t.messages.map((m) => {
              const mine = m.authorType === 'USER';
              const system = m.authorType === 'SYSTEM';
              if (system)
                return (
                  <p key={m.id} className="text-center text-xs text-navy-400">
                    {m.body} · {fmtDateTime(m.createdAt)}
                  </p>
                );
              return (
                <div key={m.id} className={cn('flex gap-3', mine && 'flex-row-reverse')}>
                  <Avatar name={m.authorName} className={mine ? '' : 'bg-gold-500 text-navy-900'} />
                  <div className={cn('max-w-[80%] rounded-2xl px-4 py-3', mine ? 'rounded-tr-sm bg-navy-800 text-white' : 'rounded-tl-sm bg-ivory text-navy-800')}>
                    <p className={cn('text-xs font-semibold', mine ? 'text-gold-300' : 'text-navy-500')}>
                      {m.authorName} · {fmtDateTime(m.createdAt)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{m.body}</p>
                    {m.attachments?.map((a) => (
                      <button key={a.file} onClick={() => api.open(`/support/attachments/${a.file}`)} className={cn('mt-2 flex items-center gap-1.5 text-xs underline', mine ? 'text-gold-200' : 'text-navy-600')}>
                        <Paperclip className="h-3 w-3" /> {a.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {closed ? (
            <div className="mt-8 flex items-center justify-between rounded-2xl bg-navy-50 p-4 text-sm text-navy-600">
              This ticket is closed.
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await api.post(`/support/tickets/${id}/reopen`);
                  qc.invalidateQueries({ queryKey: ['tickets'] });
                }}
              >
                Reopen
              </Button>
            </div>
          ) : (
            <div className="mt-8 border-t border-navy-50 pt-5">
              <Textarea rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Write a reply…" />
              <div className="mt-3 flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-1.5 text-sm text-navy-500 hover:text-navy-800">
                  <Paperclip className="h-4 w-4" /> {files.length ? `${files.length} file(s)` : 'Attach'}
                  <input type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))} />
                </label>
                <Button variant="primary" icon={<Send className="h-4 w-4" />} loading={busy} disabled={!msg.trim()} onClick={send}>
                  Send reply
                </Button>
              </div>
            </div>
          )}
        </Card>
        <Card className="h-fit">
          <KeyValue
            items={[
              ['Category', <Badge key="c">{t.category}</Badge>],
              ['Priority', <StatusBadge key="p" status={t.priority} />],
              ['Opened', fmtDateTime(t.createdAt)],
              ['Agent', t.assignedAdmin?.firstName ?? 'Unassigned'],
            ]}
          />
          {t.journalEntryId && (
            <Link href={`/app/transactions/${t.journalEntryId}`} className="mt-4 block text-sm font-semibold text-navy-700 underline">
              View linked transaction
            </Link>
          )}
          {!closed && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-4"
              onClick={async () => {
                await api.post(`/support/tickets/${id}/close`);
                toast.success('Ticket closed');
                qc.invalidateQueries({ queryKey: ['tickets'] });
              }}
            >
              Close ticket
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}
