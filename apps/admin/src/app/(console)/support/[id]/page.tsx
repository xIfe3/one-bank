'use client';

import { Avatar, Badge, Button, Card, CardHeader, Field, KeyValue, Select, Skeleton, StatusBadge, Switch, Textarea, cn, fmtDateTime } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, Paperclip, Send } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, can, useAdmin, type Admin } from '@/lib/api';

interface Ticket {
  id: string;
  number: number;
  subject: string;
  category: string;
  priority: string;
  status: string;
  journalEntryId: string | null;
  createdAt: string;
  firstResponseAt: string | null;
  assignedAdminId: string | null;
  user: { id: string; firstName: string; lastName: string; email: string; status: string; kycLevel: number };
  messages: { id: string; authorType: string; authorName: string; body: string; internal: boolean; createdAt: string; attachments: { name: string; file: string }[] }[];
}

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const admin = useAdmin();
  const qc = useQueryClient();
  const { data: t, isLoading } = useQuery({ queryKey: ['ticket', id], queryFn: () => api.get<Ticket>(`/admin/tickets/${id}`), refetchInterval: 15_000 });
  const { data: team } = useQuery({ queryKey: ['team'], queryFn: () => api.get<Admin[]>('/admin/team') });
  const { data: canned } = useQuery({ queryKey: ['canned'], queryFn: () => api.get<{ id: string; title: string; body: string }[]>('/admin/canned-replies') });
  const [msg, setMsg] = useState('');
  const [internal, setInternal] = useState(false);
  const [resolve, setResolve] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  if (isLoading || !t) return <Skeleton className="h-96" />;
  const canReply = can(admin, 'ADMIN', 'SUPPORT');

  const update = async (patch: object) => {
    try {
      await api.patch(`/admin/tickets/${id}`, patch);
      qc.invalidateQueries({ queryKey: ['ticket', id] });
      toast.success('Ticket updated');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <Link href="/support" className="mb-4 inline-flex items-center gap-1 text-sm text-navy-500 hover:text-navy-800">
        <ArrowLeft className="h-4 w-4" /> Inbox
      </Link>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <Card>
          <div className="mb-5 border-b border-navy-50 pb-4">
            <p className="text-xs text-navy-400">Ticket #{t.number}</p>
            <h1 className="font-display text-xl text-navy-800">{t.subject}</h1>
          </div>
          <div className="space-y-4">
            {t.messages.map((m) => {
              if (m.authorType === 'SYSTEM')
                return (
                  <p key={m.id} className="text-center text-xs text-navy-400">
                    {m.body} · {fmtDateTime(m.createdAt)}
                  </p>
                );
              const staff = m.authorType === 'ADMIN';
              return (
                <div key={m.id} className={cn('flex gap-3', staff && 'flex-row-reverse')}>
                  <Avatar name={m.authorName} className={staff ? 'bg-gold-500 text-navy-900' : ''} />
                  <div className={cn('max-w-[80%] rounded-2xl px-4 py-3', m.internal ? 'border border-dashed border-amber-300 bg-amber-50' : staff ? 'bg-navy-800 text-white' : 'bg-ivory text-navy-800')}>
                    <p className={cn('flex items-center gap-1 text-xs font-semibold', staff && !m.internal ? 'text-gold-300' : 'text-navy-500')}>
                      {m.internal && <Lock className="h-3 w-3" />} {m.authorName} · {fmtDateTime(m.createdAt)} {m.internal && '· internal note'}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{m.body}</p>
                    {m.attachments?.map((a) => (
                      <button key={a.file} onClick={() => api.open(`/admin/tickets/attachments/${a.file}`)} className="mt-2 flex items-center gap-1 text-xs underline">
                        <Paperclip className="h-3 w-3" /> {a.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {canReply && (
            <div className="mt-6 border-t border-navy-50 pt-5">
              {!!canned?.length && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {canned.map((c) => (
                    <button key={c.id} onClick={() => setMsg((m) => (m ? `${m}\n\n${c.body}` : c.body))} className="rounded-full bg-navy-50 px-3 py-1 text-xs font-medium text-navy-600 hover:bg-navy-100">
                      {c.title}
                    </button>
                  ))}
                </div>
              )}
              <Textarea rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={internal ? 'Internal note — not visible to the customer' : `Reply to ${t.user.firstName}…`} className={internal ? 'bg-amber-50' : ''} />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-5 text-sm text-navy-600">
                  <label className="flex items-center gap-2">
                    <Switch checked={internal} onChange={setInternal} label="Internal note" /> Internal note
                  </label>
                  {!internal && (
                    <label className="flex items-center gap-2">
                      <Switch checked={resolve} onChange={setResolve} label="Resolve" /> Mark resolved
                    </label>
                  )}
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <Paperclip className="h-4 w-4" /> {files.length ? `${files.length} file(s)` : 'Attach'}
                    <input type="file" multiple className="hidden" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))} />
                  </label>
                </div>
                <Button
                  icon={<Send className="h-4 w-4" />}
                  loading={busy}
                  disabled={!msg.trim()}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const fd = new FormData();
                      fd.set('message', msg);
                      fd.set('internal', String(internal));
                      if (resolve && !internal) fd.set('status', 'RESOLVED');
                      files.forEach((f) => fd.append('files', f));
                      await api.post(`/admin/tickets/${id}/messages`, fd);
                      setMsg('');
                      setFiles([]);
                      setResolve(false);
                      qc.invalidateQueries({ queryKey: ['ticket', id] });
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {internal ? 'Add note' : 'Send reply'}
                </Button>
              </div>
            </div>
          )}
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Customer" />
            <Link href={`/users/${t.user.id}`} className="flex items-center gap-3 hover:underline">
              <Avatar name={`${t.user.firstName} ${t.user.lastName}`} />
              <span>
                <span className="block font-semibold text-navy-800">
                  {t.user.firstName} {t.user.lastName}
                </span>
                <span className="text-xs text-navy-400">{t.user.email}</span>
              </span>
            </Link>
            <div className="mt-3 flex gap-2">
              <StatusBadge status={t.user.status} />
              <Badge tone="gold">KYC L{t.user.kycLevel}</Badge>
            </div>
            {t.journalEntryId && (
              <Link href={`/transactions/${t.journalEntryId}`} className="mt-3 block text-sm font-semibold text-navy-700 underline">
                Linked transaction
              </Link>
            )}
          </Card>
          <Card>
            <CardHeader title="Ticket" />
            <div className="space-y-3">
              <Field label="Status">
                <Select value={t.status} disabled={!canReply} onChange={(e) => update({ status: e.target.value })}>
                  {['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={t.priority} disabled={!canReply} onChange={(e) => update({ priority: e.target.value })}>
                  {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Assignee">
                <Select value={t.assignedAdminId ?? ''} disabled={!canReply} onChange={(e) => update({ assignedAdminId: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {team
                    ?.filter((a) => a.status === 'ACTIVE')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.firstName} {a.lastName} ({a.role.toLowerCase()})
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
            <KeyValue
              className="mt-4"
              items={[
                ['Category', t.category],
                ['Opened', fmtDateTime(t.createdAt)],
                ['First response', t.firstResponseAt ? fmtDateTime(t.firstResponseAt) : 'Awaiting'],
              ]}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
