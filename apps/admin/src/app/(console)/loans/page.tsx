'use client';

import { formatMoney } from '@onebank/shared';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Skeleton, StatusBadge, Switch, Table, Tabs, Td, Textarea, fmtDate } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionModal, type ActionSpec } from '@/components/action-modal';
import { api, can, useAdmin } from '@/lib/api';

interface Loan {
  id: string;
  product: { name: string };
  principal: string;
  interestRate: string;
  tenorMonths: number;
  totalRepayable: string;
  amountRepaid: string;
  outstanding: string;
  currency: string;
  purpose: string;
  status: string;
  createdAt: string;
  overdueInstalments: number;
  user: { id: string; firstName: string; lastName: string; email: string; kycLevel: number };
}
interface Product {
  id: string;
  name: string;
  description: string;
  currency: string;
  minAmount: string;
  maxAmount: string;
  interestRate: string;
  minTenorMonths: number;
  maxTenorMonths: number;
  lateFeePercent: string;
  minKycLevel: number;
  active: boolean;
}

export default function Loans() {
  const admin = useAdmin();
  const [tab, setTab] = useState<'APPLIED' | 'DISBURSED' | 'ALL' | 'products'>('APPLIED');
  const [action, setAction] = useState<ActionSpec | null>(null);
  const [edit, setEdit] = useState<Partial<Product> | null>(null);
  const { data: loans, isLoading } = useQuery({ queryKey: ['admin-loans', tab], queryFn: () => api.get<Loan[]>(`/admin/loans${tab === 'ALL' ? '' : `?status=${tab}`}`), enabled: tab !== 'products' });
  const { data: products } = useQuery({ queryKey: ['admin-loan-products'], queryFn: () => api.get<Product[]>('/admin/loan-products'), enabled: tab === 'products' });
  const canAct = can(admin, 'ADMIN');
  return (
    <>
      <PageHeader title="Loans" actions={tab === 'products' && canAct && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ currency: 'USD', minTenorMonths: 1, maxTenorMonths: 12, minKycLevel: 2, active: true })}>New product</Button>} />
      <Tabs
        className="mb-5 w-fit"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'APPLIED', label: 'Applications' },
          { value: 'DISBURSED', label: 'Active book' },
          { value: 'ALL', label: 'All loans' },
          { value: 'products', label: 'Products' },
        ]}
      />
      {tab === 'products' ? (
        <Card>
          <Table head={['Product', 'Currency', 'Amount', 'Rate', 'Term', 'Min KYC', 'Status', '']}>
            {products?.map((p) => (
              <tr key={p.id}>
                <Td>
                  <p className="font-semibold text-navy-800">{p.name}</p>
                  <p className="max-w-xs truncate text-xs text-navy-400">{p.description}</p>
                </Td>
                <Td>{p.currency}</Td>
                <Td className="text-xs">
                  {formatMoney(p.minAmount, p.currency)} – {formatMoney(p.maxAmount, p.currency)}
                </Td>
                <Td>{Number(p.interestRate)}%</Td>
                <Td>
                  {p.minTenorMonths}–{p.maxTenorMonths}m
                </Td>
                <Td>L{p.minKycLevel}</Td>
                <Td>{p.active ? <Badge tone="success">Active</Badge> : <Badge>Off</Badge>}</Td>
                <Td>
                  {canAct && (
                    <Button size="sm" variant="ghost" onClick={() => setEdit(p)}>
                      Edit
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : isLoading ? (
        <Skeleton className="h-60" />
      ) : (
        <Card>
          <Table head={['Customer', 'Product', 'Principal', 'Repaid / total', 'Term', 'Status', 'Applied', '']}>
            {loans?.map((l) => (
              <tr key={l.id}>
                <Td>
                  <Link href={`/users/${l.user.id}`} className="font-semibold text-navy-800 hover:underline">
                    {l.user.firstName} {l.user.lastName}
                  </Link>
                  <p className="text-xs text-navy-400">KYC L{l.user.kycLevel}</p>
                </Td>
                <Td>
                  {l.product.name}
                  <p className="max-w-[200px] truncate text-xs text-navy-400">{l.purpose}</p>
                </Td>
                <Td>{formatMoney(l.principal, l.currency)}</Td>
                <Td className="text-xs">
                  {formatMoney(l.amountRepaid, l.currency)} / {formatMoney(l.totalRepayable, l.currency)}
                </Td>
                <Td>
                  {l.tenorMonths}m @ {Number(l.interestRate)}%
                </Td>
                <Td>
                  <StatusBadge status={l.status} />
                  {l.overdueInstalments > 0 && <Badge tone="danger" className="ml-1">{l.overdueInstalments} overdue</Badge>}
                </Td>
                <Td className="text-xs">{fmtDate(l.createdAt)}</Td>
                <Td>
                  {canAct && l.status === 'APPLIED' && (
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => setAction({ title: `Approve & disburse ${formatMoney(l.principal, l.currency)}`, reasonLabel: 'Decision note', confirmLabel: 'Approve & disburse', success: 'Loan disbursed', run: (note) => api.post(`/admin/loans/${l.id}/approve`, { note }) })}>
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setAction({ title: 'Reject application', reasonLabel: 'Reason shown to customer', confirmLabel: 'Reject', danger: true, success: 'Application rejected', run: (reason) => api.post(`/admin/loans/${l.id}/reject`, { reason }) })}>
                        Reject
                      </Button>
                    </div>
                  )}
                  {canAct && l.status === 'DISBURSED' && l.overdueInstalments > 0 && (
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => setAction({ title: 'Mark as defaulted', confirmLabel: 'Mark defaulted', danger: true, success: 'Loan marked defaulted', run: (reason) => api.post(`/admin/loans/${l.id}/default`, { reason }) })}>
                      Default
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
          {!loans?.length && <p className="py-10 text-center text-sm text-navy-400">No loans in this view.</p>}
        </Card>
      )}
      <ActionModal spec={action} onClose={() => setAction(null)} />
      {edit && <ProductModal product={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function ProductModal({ product, onClose }: { product: Partial<Product>; onClose: () => void }) {
  const qc = useQueryClient();
  const [p, setP] = useState({
    name: product.name ?? '',
    description: product.description ?? '',
    currency: product.currency ?? 'USD',
    minAmount: product.minAmount ?? '',
    maxAmount: product.maxAmount ?? '',
    interestRate: product.interestRate ?? '',
    minTenorMonths: String(product.minTenorMonths ?? 1),
    maxTenorMonths: String(product.maxTenorMonths ?? 12),
    lateFeePercent: product.lateFeePercent ?? '2',
    minKycLevel: String(product.minKycLevel ?? 2),
    active: product.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof p) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setP({ ...p, [k]: e.target.value });
  return (
    <Modal
      open
      onClose={onClose}
      title={product.id ? 'Edit loan product' : 'New loan product'}
      size="lg"
      footer={
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.post('/admin/loan-products', {
                id: product.id,
                name: p.name,
                description: p.description,
                currency: p.currency,
                minAmount: Number(p.minAmount),
                maxAmount: Number(p.maxAmount),
                interestRate: Number(p.interestRate),
                minTenorMonths: Number(p.minTenorMonths),
                maxTenorMonths: Number(p.maxTenorMonths),
                lateFeePercent: Number(p.lateFeePercent),
                minKycLevel: Number(p.minKycLevel),
                active: p.active,
              });
              toast.success('Product saved');
              qc.invalidateQueries({ queryKey: ['admin-loan-products'] });
              onClose();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save product
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input value={p.name} onChange={set('name')} />
        </Field>
        <Field label="Currency">
          <Select value={p.currency} onChange={set('currency')}>
            {['USD', 'EUR', 'GBP', 'NGN'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea rows={2} value={p.description} onChange={set('description')} />
        </Field>
        <Field label="Min amount">
          <Input value={p.minAmount} onChange={set('minAmount')} />
        </Field>
        <Field label="Max amount">
          <Input value={p.maxAmount} onChange={set('maxAmount')} />
        </Field>
        <Field label="Interest rate (% p.a.)">
          <Input value={p.interestRate} onChange={set('interestRate')} />
        </Field>
        <Field label="Late fee (% of instalment)">
          <Input value={p.lateFeePercent} onChange={set('lateFeePercent')} />
        </Field>
        <Field label="Min term (months)">
          <Input value={p.minTenorMonths} onChange={set('minTenorMonths')} />
        </Field>
        <Field label="Max term (months)">
          <Input value={p.maxTenorMonths} onChange={set('maxTenorMonths')} />
        </Field>
        <Field label="Minimum KYC level">
          <Select value={p.minKycLevel} onChange={set('minKycLevel')}>
            {[0, 1, 2, 3].map((l) => (
              <option key={l} value={l}>
                Level {l}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-3 self-end pb-3 text-sm text-navy-700">
          <Switch checked={p.active} onChange={(v) => setP({ ...p, active: v })} label="Active" /> Available to customers
        </label>
      </div>
      <p className="mt-4 text-xs text-navy-400">Changes apply to new applications only.</p>
    </Modal>
  );
}
