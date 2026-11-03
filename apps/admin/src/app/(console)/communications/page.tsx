'use client';

import { Badge, Button, Card, CardHeader, Field, Input, Modal, PageHeader, Pagination, Select, Skeleton, StatusBadge, Switch, Table, Tabs, Td, Textarea, fmtDateTime, qs } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Plus, RotateCw, Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, can, useAdmin, type Paged } from '@/lib/api';

interface Announcement {
  id: string;
  title: string;
  body: string;
  variant: string;
  active: boolean;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
}
interface Email {
  id: string;
  to: string;
  subject: string;
  template: string;
  status: string;
  error: string | null;
  attempts: number;
  sentAt: string | null;
  createdAt: string;
}

export default function Communications() {
  const [tab, setTab] = useState<'broadcast' | 'announcements' | 'emails'>('broadcast');
  return (
    <>
      <PageHeader title="Communications" subtitle="Reach customers in-app and by email." />
      <Tabs
        className="mb-6 w-fit"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'broadcast', label: 'Broadcast' },
          { value: 'announcements', label: 'Announcements' },
          { value: 'emails', label: 'Email outbox' },
        ]}
      />
      {tab === 'broadcast' && <Broadcast />}
      {tab === 'announcements' && <Announcements />}
      {tab === 'emails' && <Emails />}
    </>
  );
}

function Broadcast() {
  const admin = useAdmin();
  const [f, setF] = useState({ title: '', body: '', link: '', inApp: true, email: false, status: '', kycLevel: '', country: '', currency: '' });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const send = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ recipients: number }>('/admin/broadcast', {
        title: f.title,
        body: f.body,
        link: f.link || undefined,
        channels: [...(f.inApp ? ['IN_APP'] : []), ...(f.email ? ['EMAIL'] : [])],
        segment: { status: f.status || undefined, kycLevel: f.kycLevel === '' ? undefined : Number(f.kycLevel), country: f.country || undefined, currency: f.currency || undefined },
      });
      toast.success(`Sent to ${r.recipients} customer(s)`);
      setF({ ...f, title: '', body: '', link: '' });
      setConfirm(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader title="Compose" />
        <div className="space-y-4">
          <Field label="Title">
            <Input value={f.title} onChange={set('title')} placeholder="e.g. New: 10% fixed deposits" />
          </Field>
          <Field label="Message" hint="Plain text. Blank lines become paragraphs in email.">
            <Textarea rows={7} value={f.body} onChange={set('body')} />
          </Field>
          <Field label="Link (optional)">
            <Input value={f.link} onChange={set('link')} placeholder="/app/savings" />
          </Field>
          <div className="flex gap-6 text-sm text-navy-700">
            <label className="flex items-center gap-2">
              <Switch checked={f.inApp} onChange={(v) => setF({ ...f, inApp: v })} label="In-app" /> In-app notification
            </label>
            <label className="flex items-center gap-2">
              <Switch checked={f.email} onChange={(v) => setF({ ...f, email: v })} label="Email" /> Email
            </label>
          </div>
          <Button variant="gold" icon={<Send className="h-4 w-4" />} disabled={!can(admin, 'ADMIN', 'SUPPORT') || f.title.length < 2 || f.body.length < 2 || (!f.inApp && !f.email)} onClick={() => setConfirm(true)}>
            Review & send
          </Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="Audience" subtitle="Leave a filter empty to include everyone." />
        <div className="space-y-4">
          <Field label="Account status">
            <Select value={f.status} onChange={set('status')}>
              <option value="">Active & suspended</option>
              <option value="ACTIVE">Active only</option>
              <option value="SUSPENDED">Suspended only</option>
              <option value="PENDING_VERIFICATION">Unverified email</option>
            </Select>
          </Field>
          <Field label="KYC level">
            <Select value={f.kycLevel} onChange={set('kycLevel')}>
              <option value="">Any</option>
              {[0, 1, 2, 3].map((l) => (
                <option key={l} value={l}>
                  Level {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Country (ISO code)">
            <Input value={f.country} onChange={(e) => setF({ ...f, country: e.target.value.toUpperCase().slice(0, 2) })} placeholder="US" />
          </Field>
          <Field label="Holds currency">
            <Select value={f.currency} onChange={set('currency')}>
              <option value="">Any</option>
              {['USD', 'EUR', 'GBP', 'NGN'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Send broadcast?"
        footer={
          <Button variant="gold" loading={busy} onClick={send}>
            Send now
          </Button>
        }
      >
        <p className="text-sm text-navy-600">
          “<span className="font-semibold">{f.title}</span>” will be sent via {[f.inApp && 'in-app', f.email && 'email'].filter(Boolean).join(' and ')} to all customers matching your filters. This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

function Announcements() {
  const qc = useQueryClient();
  const admin = useAdmin();
  const { data } = useQuery({ queryKey: ['announcements'], queryFn: () => api.get<Announcement[]>('/admin/announcements') });
  const [edit, setEdit] = useState<Partial<Announcement> | null>(null);
  const editable = can(admin, 'ADMIN', 'SUPPORT');
  return (
    <Card>
      <CardHeader title="Announcements" subtitle="Banners on the customer dashboard. PROMO ones also appear on the marketing site." action={editable && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ variant: 'INFO', active: true })}>New</Button>} />
      <Table head={['Title', 'Variant', 'Window', 'Status', '']}>
        {data?.map((a) => (
          <tr key={a.id}>
            <Td>
              <p className="font-semibold text-navy-800">{a.title}</p>
              <p className="max-w-md truncate text-xs text-navy-400">{a.body}</p>
            </Td>
            <Td>
              <Badge tone={a.variant === 'PROMO' ? 'gold' : a.variant === 'WARNING' ? 'warning' : 'info'}>{a.variant}</Badge>
            </Td>
            <Td className="text-xs">
              {fmtDateTime(a.startsAt)} → {a.endsAt ? fmtDateTime(a.endsAt) : 'no end'}
            </Td>
            <Td>
              {editable ? (
                <Switch
                  checked={a.active}
                  label="Active"
                  onChange={async (v) => {
                    await api.patch(`/admin/announcements/${a.id}`, { active: v });
                    qc.invalidateQueries({ queryKey: ['announcements'] });
                  }}
                />
              ) : (
                <StatusBadge status={a.active ? 'ACTIVE' : 'DISABLED'} />
              )}
            </Td>
            <Td>
              {editable && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEdit(a)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onClick={async () => {
                      await api.del(`/admin/announcements/${a.id}`);
                      qc.invalidateQueries({ queryKey: ['announcements'] });
                    }}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </Td>
          </tr>
        ))}
      </Table>
      {edit && <AnnouncementModal a={edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function AnnouncementModal({ a, onClose }: { a: Partial<Announcement>; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ title: a.title ?? '', body: a.body ?? '', variant: a.variant ?? 'INFO', endsAt: a.endsAt?.slice(0, 16) ?? '', active: a.active ?? true });
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={a.id ? 'Edit announcement' : 'New announcement'}
      footer={
        <Button
          loading={busy}
          disabled={f.title.length < 2 || f.body.length < 2}
          onClick={async () => {
            setBusy(true);
            try {
              const body = { ...f, endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null };
              if (a.id) await api.patch(`/admin/announcements/${a.id}`, body);
              else await api.post('/admin/announcements', body);
              toast.success('Saved');
              qc.invalidateQueries({ queryKey: ['announcements'] });
              onClose();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="Body">
          <Textarea rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Variant">
            <Select value={f.variant} onChange={(e) => setF({ ...f, variant: e.target.value })}>
              {['INFO', 'SUCCESS', 'WARNING', 'PROMO'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ends (optional)">
            <Input type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function Emails() {
  const admin = useAdmin();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['emails', status, q, page], queryFn: () => api.get<Paged<Email>>(`/admin/emails${qs({ status, q, page })}`), refetchInterval: 15_000 });
  const { data: email } = useQuery({ queryKey: ['email', view], queryFn: () => api.get<Email & { html: string }>(`/admin/emails/${view}`), enabled: !!view });
  return (
    <Card>
      <CardHeader
        title="Email outbox"
        subtitle="Every email the bank has sent, with delivery status. Failed sends retry 5× automatically."
        action={
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} placeholder="Recipient or subject" className="h-9 w-56" />
            <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="h-9 w-36">
              <option value="">Any status</option>
              {['SENT', 'QUEUED', 'FAILED'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </div>
        }
      />
      {isLoading ? (
        <Skeleton className="h-60" />
      ) : (
        <>
          <Table head={['Created', 'To', 'Subject', 'Template', 'Status', 'Attempts', '']}>
            {data?.items.map((e) => (
              <tr key={e.id}>
                <Td className="text-xs">{fmtDateTime(e.createdAt)}</Td>
                <Td className="text-xs">{e.to}</Td>
                <Td className="max-w-xs truncate">{e.subject}</Td>
                <Td className="font-mono text-xs">{e.template}</Td>
                <Td>
                  <StatusBadge status={e.status} />
                  {e.error && <p className="max-w-[200px] truncate text-[11px] text-danger">{e.error}</p>}
                </Td>
                <Td>{e.attempts}</Td>
                <Td>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setView(e.id)}>
                      View
                    </Button>
                    {e.status !== 'SENT' && can(admin, 'ADMIN', 'SUPPORT') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<RotateCw className="h-3.5 w-3.5" />}
                        onClick={async () => {
                          await api.post(`/admin/emails/${e.id}/resend`);
                          toast.success('Queued for resend');
                          qc.invalidateQueries({ queryKey: ['emails'] });
                        }}
                      >
                        Resend
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
          {data && <Pagination page={data.page} pages={data.pages} onChange={setPage} />}
        </>
      )}
      {view && (
        <Modal open onClose={() => setView(null)} title={email?.subject ?? 'Email'} subtitle={email?.to} size="lg">
          {email ? <iframe title="Email preview" srcDoc={email.html} sandbox="" className="h-[60vh] w-full rounded-xl border border-navy-100" /> : <Skeleton className="h-96" />}
        </Modal>
      )}
      {!data?.items.length && !isLoading && (
        <div className="py-8 text-center text-sm text-navy-400">
          <Megaphone className="mx-auto mb-2 h-6 w-6" /> No emails yet.
        </div>
      )}
    </Card>
  );
}
