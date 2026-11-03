'use client';

import { BILL_CATEGORIES } from '@onebank/shared';
import { Badge, Button, Card, CardHeader, Field, Input, Modal, PageHeader, Select, Switch, Table, Tabs, Td, Textarea, fmtDateTime } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, can, useAdmin } from '@/lib/api';

type Tab = 'fx' | 'banks' | 'billers' | 'faqs' | 'canned';

export default function Catalog() {
  const [tab, setTab] = useState<Tab>('fx');
  return (
    <>
      <PageHeader title="Catalog & rates" subtitle="Exchange rates, banks, billers, FAQs and support templates." />
      <Tabs
        className="mb-6 w-fit"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'fx', label: 'FX rates' },
          { value: 'banks', label: 'Banks' },
          { value: 'billers', label: 'Bill providers' },
          { value: 'faqs', label: 'FAQs' },
          { value: 'canned', label: 'Canned replies' },
        ]}
      />
      {tab === 'fx' && <Fx />}
      {tab === 'banks' && <Banks />}
      {tab === 'billers' && <Billers />}
      {tab === 'faqs' && <Faqs />}
      {tab === 'canned' && <Canned />}
    </>
  );
}

function Fx() {
  const admin = useAdmin();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['fx'], queryFn: () => api.get<{ quote: string; rate: string; spread: string; updatedAt: string }[]>('/admin/fx-rates') });
  const [rows, setRows] = useState<{ quote: string; rate: string; spread: string }[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => data && setRows(data.map((d) => ({ quote: d.quote, rate: d.rate, spread: d.spread }))), [data]);
  return (
    <Card>
      <CardHeader title="Exchange rates" subtitle="Rates are 1 USD → currency. Customers receive mid-rate minus the spread (%)." />
      <Table head={['Currency', 'Rate (per 1 USD)', 'Spread %', 'Updated']}>
        {rows.map((r, i) => (
          <tr key={r.quote}>
            <Td className="font-semibold">{r.quote}</Td>
            <Td>
              <Input className="h-9 w-40" value={r.rate} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))} />
            </Td>
            <Td>
              <Input className="h-9 w-24" value={r.spread} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, spread: e.target.value } : x)))} />
            </Td>
            <Td className="text-xs">{fmtDateTime(data?.find((d) => d.quote === r.quote)?.updatedAt)}</Td>
          </tr>
        ))}
      </Table>
      {can(admin, 'ADMIN') && (
        <Button
          className="mt-4"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.put('/admin/fx-rates', rows.map((r) => ({ quote: r.quote, rate: Number(r.rate), spread: Number(r.spread) })));
              toast.success('Rates updated');
              qc.invalidateQueries({ queryKey: ['fx'] });
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save rates
        </Button>
      )}
    </Card>
  );
}

function Banks() {
  const admin = useAdmin();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['banks'], queryFn: () => api.get<{ id: string; code: string; name: string; country: string; active: boolean }[]>('/admin/banks') });
  const [f, setF] = useState({ code: '', name: '', country: 'US' });
  const save = async (b: { code: string; name: string; country: string; active: boolean }) => {
    try {
      await api.post('/admin/banks', b);
      qc.invalidateQueries({ queryKey: ['banks'] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const editable = can(admin, 'ADMIN');
  return (
    <Card>
      <CardHeader title="Banks" subtitle="Available destinations for domestic transfers." />
      {editable && (
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr_100px_auto]">
          <Input placeholder="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
          <Input placeholder="Bank name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input placeholder="CC" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value.toUpperCase().slice(0, 2) })} />
          <Button
            icon={<Plus className="h-4 w-4" />}
            disabled={!f.code || !f.name}
            onClick={async () => {
              await save({ ...f, active: true });
              setF({ code: '', name: '', country: 'US' });
            }}
          >
            Add
          </Button>
        </div>
      )}
      <Table head={['Code', 'Name', 'Country', 'Active']}>
        {data?.map((b) => (
          <tr key={b.id}>
            <Td className="font-mono text-xs">{b.code}</Td>
            <Td>{b.name}</Td>
            <Td>{b.country}</Td>
            <Td>
              <Switch checked={b.active} disabled={!editable} label="Active" onChange={(v) => save({ code: b.code, name: b.name, country: b.country, active: v })} />
            </Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function Billers() {
  const admin = useAdmin();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['billers'], queryFn: () => api.get<{ id: string; code: string; name: string; category: string; currencies: string[]; active: boolean; logoColor: string }[]>('/admin/bill-providers') });
  const [edit, setEdit] = useState<{ code: string; name: string; category: string; currencies: string; logoColor: string; active: boolean } | null>(null);
  const editable = can(admin, 'ADMIN');
  const save = async (b: { code: string; name: string; category: string; currencies: string[]; logoColor: string; active: boolean }) => {
    try {
      await api.post('/admin/bill-providers', b);
      qc.invalidateQueries({ queryKey: ['billers'] });
      toast.success('Saved');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Card>
      <CardHeader title="Bill providers" action={editable && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ code: '', name: '', category: 'ELECTRICITY', currencies: 'USD', logoColor: '#C9A227', active: true })}>New provider</Button>} />
      <Table head={['Provider', 'Category', 'Currencies', 'Active', '']}>
        {data?.map((b) => (
          <tr key={b.id}>
            <Td>
              <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: b.logoColor }} />
              <span className="font-semibold">{b.name}</span> <span className="font-mono text-xs text-navy-400">{b.code}</span>
            </Td>
            <Td>{b.category}</Td>
            <Td>{b.currencies.join(', ')}</Td>
            <Td>
              <Switch checked={b.active} disabled={!editable} label="Active" onChange={(v) => save({ ...b, active: v })} />
            </Td>
            <Td>
              {editable && (
                <Button size="sm" variant="ghost" onClick={() => setEdit({ ...b, currencies: b.currencies.join(',') })}>
                  Edit
                </Button>
              )}
            </Td>
          </tr>
        ))}
      </Table>
      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title="Bill provider"
          footer={
            <Button
              onClick={async () => {
                await save({ ...edit, currencies: edit.currencies.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean) });
                setEdit(null);
              }}
            >
              Save
            </Button>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Code">
              <Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Name">
              <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="Category">
              <Select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                {BILL_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Currencies (comma separated)">
              <Input value={edit.currencies} onChange={(e) => setEdit({ ...edit, currencies: e.target.value })} />
            </Field>
            <Field label="Brand colour">
              <Input type="color" value={edit.logoColor} onChange={(e) => setEdit({ ...edit, logoColor: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function Faqs() {
  const admin = useAdmin();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-faqs'], queryFn: () => api.get<{ id: string; category: string; question: string; answer: string; order: number; published: boolean }[]>('/admin/faqs') });
  const [edit, setEdit] = useState<{ id?: string; category: string; question: string; answer: string; order: number; published: boolean } | null>(null);
  const editable = can(admin, 'ADMIN', 'SUPPORT');
  return (
    <Card>
      <CardHeader title="Help centre FAQs" subtitle="Shown on /help and suggested when customers open tickets." action={editable && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ category: 'Getting started', question: '', answer: '', order: 0, published: true })}>New FAQ</Button>} />
      <Table head={['Category', 'Question', 'Published', '']}>
        {data?.map((f) => (
          <tr key={f.id}>
            <Td className="text-xs">{f.category}</Td>
            <Td className="max-w-lg whitespace-normal">{f.question}</Td>
            <Td>{f.published ? <Badge tone="success">Yes</Badge> : <Badge>No</Badge>}</Td>
            <Td>
              {editable && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEdit(f)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Delete"
                    onClick={async () => {
                      await api.del(`/admin/faqs/${f.id}`);
                      qc.invalidateQueries({ queryKey: ['admin-faqs'] });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-danger" />
                  </Button>
                </div>
              )}
            </Td>
          </tr>
        ))}
      </Table>
      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={edit.id ? 'Edit FAQ' : 'New FAQ'}
          footer={
            <Button
              onClick={async () => {
                try {
                  await api.post('/admin/faqs', { ...edit, order: Number(edit.order) });
                  qc.invalidateQueries({ queryKey: ['admin-faqs'] });
                  setEdit(null);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Save
            </Button>
          }
        >
          <div className="space-y-4">
            <Field label="Category">
              <Input value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
            </Field>
            <Field label="Question">
              <Input value={edit.question} onChange={(e) => setEdit({ ...edit, question: e.target.value })} />
            </Field>
            <Field label="Answer">
              <Textarea rows={5} value={edit.answer} onChange={(e) => setEdit({ ...edit, answer: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={edit.published} onChange={(v) => setEdit({ ...edit, published: v })} label="Published" /> Published
            </label>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function Canned() {
  const qc = useQueryClient();
  const admin = useAdmin();
  const { data } = useQuery({ queryKey: ['canned'], queryFn: () => api.get<{ id: string; title: string; body: string }[]>('/admin/canned-replies') });
  const [f, setF] = useState({ title: '', body: '' });
  const editable = can(admin, 'ADMIN', 'SUPPORT');
  return (
    <Card>
      <CardHeader title="Canned replies" subtitle="One-click templates in the support inbox." />
      {editable && (
        <div className="mb-5 space-y-2 rounded-2xl bg-ivory p-4">
          <Input placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Textarea rows={3} placeholder="Reply text" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          <Button
            size="sm"
            disabled={f.title.length < 2 || f.body.length < 2}
            onClick={async () => {
              await api.post('/admin/canned-replies', f);
              setF({ title: '', body: '' });
              qc.invalidateQueries({ queryKey: ['canned'] });
            }}
          >
            Add reply
          </Button>
        </div>
      )}
      <div className="space-y-3">
        {data?.map((c) => (
          <div key={c.id} className="flex items-start justify-between gap-4 rounded-xl border border-navy-100 p-3">
            <div>
              <p className="font-semibold text-navy-800">{c.title}</p>
              <p className="text-sm text-navy-500">{c.body}</p>
            </div>
            {editable && (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Delete"
                onClick={async () => {
                  await api.del(`/admin/canned-replies/${c.id}`);
                  qc.invalidateQueries({ queryKey: ['canned'] });
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-danger" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
