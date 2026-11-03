'use client';

import { Avatar, Badge, Button, Card, Field, Input, Modal, PageHeader, Select, StatusBadge, Table, Td, fmtDateTime } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionModal, type ActionSpec } from '@/components/action-modal';
import { api, useAdmin, type Admin } from '@/lib/api';

const ROLE_DESC: Record<string, string> = {
  SUPERADMIN: 'Everything, including settings, team and impersonation',
  ADMIN: 'Users, ledger, transfers, loans, cards, catalog',
  SUPPORT: 'Tickets, read users, notifications',
  COMPLIANCE: 'KYC, review queue, freezes, fraud, audit',
};

export default function Team() {
  const me = useAdmin();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['team'], queryFn: () => api.get<Admin[]>('/admin/team') });
  const [invite, setInvite] = useState(false);
  const [action, setAction] = useState<ActionSpec | null>(null);
  const superadmin = me.role === 'SUPERADMIN';
  const update = async (id: string, patch: object) => {
    try {
      await api.patch(`/admin/team/${id}`, patch);
      toast.success('Admin updated');
      qc.invalidateQueries({ queryKey: ['team'] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <>
      <PageHeader title="Admin team" subtitle="Staff with access to this console." actions={superadmin && <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setInvite(true)}>Invite admin</Button>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(ROLE_DESC).map(([r, d]) => (
          <Card key={r} className="p-4 sm:p-4">
            <Badge tone="gold">{r}</Badge>
            <p className="mt-2 text-xs text-navy-500">{d}</p>
          </Card>
        ))}
      </div>
      <Card>
        <Table head={['Admin', 'Role', 'Status', '2FA', 'Last sign-in', '']}>
          {data?.map((a) => (
            <tr key={a.id}>
              <Td>
                <div className="flex items-center gap-3">
                  <Avatar name={`${a.firstName} ${a.lastName}`} />
                  <span>
                    <span className="block font-semibold text-navy-800">
                      {a.firstName} {a.lastName} {a.id === me.id && <Badge>You</Badge>}
                    </span>
                    <span className="text-xs text-navy-400">{a.email}</span>
                  </span>
                </div>
              </Td>
              <Td>
                {superadmin && a.id !== me.id ? (
                  <Select className="h-9 w-40" value={a.role} onChange={(e) => update(a.id, { role: e.target.value })}>
                    {Object.keys(ROLE_DESC).map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </Select>
                ) : (
                  <Badge tone="gold">{a.role}</Badge>
                )}
              </Td>
              <Td>
                <StatusBadge status={a.status} />
              </Td>
              <Td>{a.twoFactorEnabled ? <Badge tone="success">On</Badge> : <Badge tone="warning">Pending</Badge>}</Td>
              <Td className="text-xs">{a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : 'Never'}</Td>
              <Td>
                {superadmin && a.id !== me.id && (
                  <div className="flex gap-1">
                    {a.twoFactorEnabled && (
                      <Button size="sm" variant="ghost" onClick={() => setAction({ title: `Reset 2FA for ${a.firstName}`, confirmLabel: 'Reset', reason: false, success: '2FA reset — they’ll set it up at next sign-in', run: () => api.patch(`/admin/team/${a.id}`, { reset2fa: true }) })}>
                        Reset 2FA
                      </Button>
                    )}
                    {a.status === 'ACTIVE' ? (
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setAction({ title: `Disable ${a.firstName}`, confirmLabel: 'Disable', danger: true, reason: false, success: 'Admin disabled', run: () => api.patch(`/admin/team/${a.id}`, { status: 'DISABLED' }) })}>
                        Disable
                      </Button>
                    ) : a.status === 'DISABLED' ? (
                      <Button size="sm" variant="ghost" onClick={() => update(a.id, { status: 'ACTIVE' })}>
                        Enable
                      </Button>
                    ) : null}
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
      <ActionModal spec={action} onClose={() => setAction(null)} />
      {invite && <InviteModal onClose={() => setInvite(false)} />}
    </>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ email: '', firstName: '', lastName: '', role: 'SUPPORT' });
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Invite an admin"
      subtitle="They’ll receive an email to set a password, then set up 2FA on first sign-in."
      footer={
        <Button
          loading={busy}
          disabled={!f.email || !f.firstName || !f.lastName}
          onClick={async () => {
            setBusy(true);
            try {
              await api.post('/admin/team', f);
              toast.success('Invitation sent');
              qc.invalidateQueries({ queryKey: ['team'] });
              onClose();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Send invitation
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name">
          <Input value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
        </Field>
        <Field label="Last name">
          <Input value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
        </Field>
        <Field label="Work email" className="sm:col-span-2">
          <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Role" className="sm:col-span-2" hint={ROLE_DESC[f.role]}>
          <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {Object.keys(ROLE_DESC).map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
