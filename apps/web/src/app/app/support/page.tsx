'use client';

import { TICKET_CATEGORIES, TICKET_PRIORITIES } from '@onebank/shared';
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Skeleton, StatusBadge, Textarea, timeAgo } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, Lightbulb, Paperclip, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
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
  lastActivityAt: string;
  messages: { body: string; authorType: string }[];
}

function SupportPage() {
  const params = useSearchParams();
  const { data, isLoading } = useQuery({ queryKey: ['tickets'], queryFn: () => api.get<Ticket[]>('/support/tickets') });
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(params.get('new') === '1'), [params]);
  return (
    <>
      <PageHeader title="Support" subtitle="Our team typically replies within 4 hours." actions={<Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New ticket</Button>} />
      <Card>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : data?.length ? (
          <div className="divide-y divide-navy-50">
            {data.map((t) => (
              <Link key={t.id} href={`/app/support/${t.id}`} className="-mx-2 flex items-center gap-4 rounded-xl px-2 py-4 hover:bg-ivory">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy-50 text-xs font-bold text-navy-600">#{t.number}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-navy-800">{t.subject}</p>
                  <p className="truncate text-sm text-navy-400">
                    {t.messages[0]?.authorType === 'ADMIN' ? 'One Bank: ' : ''}
                    {t.messages[0]?.body}
                  </p>
                </div>
                <div className="hidden text-right sm:block">
                  <StatusBadge status={t.status} />
                  <p className="mt-1 text-xs text-navy-400">{timeAgo(t.lastActivityAt)}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon={<LifeBuoy className="h-6 w-6" />} title="No tickets yet" body="Have a question or a problem? We’re here to help." action={<Button onClick={() => setOpen(true)}>Contact support</Button>} />
        )}
      </Card>
      <NewTicket open={open} onClose={() => setOpen(false)} defaults={{ subject: params.get('subject') ?? '', journalEntryId: params.get('tx') ?? undefined }} />
    </>
  );
}

function NewTicket({ open, onClose, defaults }: { open: boolean; onClose: () => void; defaults: { subject: string; journalEntryId?: string } }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [subject, setSubject] = useState(defaults.subject);
  const [category, setCategory] = useState(defaults.journalEntryId ? 'TRANSACTION' : 'ACCOUNT');
  const [priority, setPriority] = useState('MEDIUM');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSubject(defaults.subject), [defaults.subject]);
  const { data: faqs } = useQuery({
    queryKey: ['faqs', subject],
    queryFn: () => api.get<{ id: string; question: string; answer: string }[]>(`/public/faqs?q=${encodeURIComponent(subject.split(' ').filter((w) => w.length > 3).slice(0, 2).join(' '))}`),
    enabled: subject.length > 5,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New support ticket"
      size="lg"
      footer={
        <Button
          variant="gold"
          loading={busy}
          disabled={subject.length < 4 || message.length < 5}
          onClick={async () => {
            setBusy(true);
            try {
              const fd = new FormData();
              fd.set('subject', subject);
              fd.set('category', category);
              fd.set('priority', priority);
              fd.set('message', message);
              if (defaults.journalEntryId) fd.set('journalEntryId', defaults.journalEntryId);
              files.forEach((f) => fd.append('files', f));
              const t = await api.post<{ id: string; number: number }>('/support/tickets', fd);
              toast.success(`Ticket #${t.number} created`);
              qc.invalidateQueries({ queryKey: ['tickets'] });
              router.push(`/app/support/${t.id}`);
            } catch (e) {
              handleError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Submit ticket
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Subject">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Briefly describe the issue" />
        </Field>
        {!!faqs?.length && (
          <div className="rounded-2xl border border-gold-200 bg-gold-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-navy-800">
              <Lightbulb className="h-4 w-4 text-gold-600" /> These answers might help
            </p>
            {faqs.slice(0, 3).map((f) => (
              <details key={f.id} className="mt-2 text-sm">
                <summary className="cursor-pointer font-medium text-navy-700">{f.question}</summary>
                <p className="mt-1 text-navy-500">{f.answer}</p>
              </details>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {TICKET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0) + c.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {defaults.journalEntryId && <p className="rounded-xl bg-navy-50 px-3 py-2 text-xs text-navy-600">This ticket will be linked to the transaction you were viewing.</p>}
        <Field label="Message">
          <Textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us what happened. Never include your password, PIN or full card number." />
        </Field>
        <Field label="Attachments (optional)" hint="Up to 3 images or PDFs, 5 MB each.">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-navy-200 px-4 py-3 text-sm text-navy-500 hover:border-gold-500">
            <Paperclip className="h-4 w-4" /> {files.length ? files.map((f) => f.name).join(', ') : 'Choose files'}
            <input type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))} />
          </label>
        </Field>
      </div>
    </Modal>
  );
}

export default function Page() {
  return (
    <Suspense>
      <SupportPage />
    </Suspense>
  );
}
