'use client';

import { Alert, Button, Card, CardHeader, Field, Input, Modal, PageHeader, Skeleton, Switch, Table, Td, Textarea, cn } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Power, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, useAdmin } from '@/lib/api';

interface FeeRule {
  flat: number;
  percent: number;
  min: number;
  max: number;
}
interface Settings {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  maintenanceEta: string | null;
  features: Record<string, boolean>;
  fees: Record<string, FeeRule>;
  reviewThresholdUsd: number;
  otpThresholdUsd: number;
  depositDailyCapUsd: number;
  savingsRate: number;
  fixedDepositRates: Record<string, number>;
  fixedDepositPenaltyPercent: number;
  referralBonusUsd: number;
  lowBalanceUsd: number;
  kycLimits: Record<string, { dailyUsd: number; singleUsd: number; label: string }>;
}

const FEATURE_LABELS: Record<string, string> = {
  signups: 'New sign-ups',
  deposits: 'Add money (deposits)',
  internalTransfers: 'Transfers between members',
  interbank: 'Domestic bank transfers',
  wire: 'International wires',
  bills: 'Bill payments',
  cards: 'Virtual cards',
  loans: 'Loan applications',
  fx: 'Currency exchange',
  savings: 'Savings & fixed deposits',
};

export default function SettingsPage() {
  const admin = useAdmin();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/admin/settings') });
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [maint, setMaint] = useState(false);
  useEffect(() => data && setS(structuredClone(data)), [data]);
  const readOnly = admin.role !== 'SUPERADMIN';
  if (!s) return <Skeleton className="h-96" />;

  const save = async (patch: Partial<Settings>, msg = 'Settings saved') => {
    setBusy(true);
    try {
      await api.put('/admin/settings', patch);
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const num = (v: string) => (v === '' ? 0 : Number(v));

  return (
    <>
      <PageHeader title="System settings" subtitle={readOnly ? 'Read-only — only superadmins can change platform settings.' : 'Changes take effect within seconds and are recorded in the audit log.'} />
      <Card className={cn('mb-6 border-2', s.maintenanceMode ? 'border-amber-400 bg-amber-50' : 'border-transparent')}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className={cn('grid h-12 w-12 place-items-center rounded-2xl', s.maintenanceMode ? 'bg-amber-400 text-navy-900' : 'bg-navy-800 text-gold-300')}>
              <Wrench className="h-6 w-6" />
            </span>
            <div>
              <p className="font-serif text-xl text-navy-800">Maintenance mode is {s.maintenanceMode ? 'ON' : 'off'}</p>
              <p className="text-sm text-navy-500">When on, customers see a maintenance page and the customer API returns 503. The admin console keeps working.</p>
            </div>
          </div>
          <Button variant={s.maintenanceMode ? 'primary' : 'danger'} icon={<Power className="h-4 w-4" />} disabled={readOnly} onClick={() => setMaint(true)}>
            {s.maintenanceMode ? 'Turn off maintenance' : 'Enable maintenance'}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Feature flags" subtitle="Switch individual services off without a deploy." />
          <div className="divide-y divide-navy-50">
            {Object.entries(s.features).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-3">
                <span className="text-sm text-navy-700">{FEATURE_LABELS[k] ?? k}</span>
                <Switch checked={v} disabled={readOnly} label={k} onChange={(nv) => setS({ ...s, features: { ...s.features, [k]: nv } })} />
              </div>
            ))}
          </div>
          {!readOnly && (
            <Button className="mt-4" loading={busy} onClick={() => save({ features: s.features }, 'Feature flags saved')}>
              Save flags
            </Button>
          )}
        </Card>

        <Card>
          <CardHeader title="Thresholds & rates" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(
              [
                ['reviewThresholdUsd', 'Compliance review above (USD)'],
                ['otpThresholdUsd', 'Require OTP above (USD)'],
                ['depositDailyCapUsd', 'Card/bank top-up cap per day (USD)'],
                ['savingsRate', 'Savings goal rate (% p.a.)'],
                ['fixedDepositPenaltyPercent', 'FD early-break penalty (% principal)'],
                ['referralBonusUsd', 'Referral bonus (USD)'],
                ['lowBalanceUsd', 'Low-balance alert below (USD)'],
              ] as const
            ).map(([k, l]) => (
              <Field key={k} label={l}>
                <Input disabled={readOnly} value={String(s[k])} onChange={(e) => setS({ ...s, [k]: num(e.target.value) })} />
              </Field>
            ))}
          </div>
          <p className="mt-5 text-sm font-semibold text-navy-700">Fixed deposit rates (% p.a.)</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {Object.entries(s.fixedDepositRates).map(([d, r]) => (
              <Field key={d} label={`${d} days`}>
                <Input disabled={readOnly} value={String(r)} onChange={(e) => setS({ ...s, fixedDepositRates: { ...s.fixedDepositRates, [d]: num(e.target.value) } })} />
              </Field>
            ))}
          </div>
          {!readOnly && (
            <Button
              className="mt-4"
              loading={busy}
              onClick={() =>
                save({
                  reviewThresholdUsd: s.reviewThresholdUsd,
                  otpThresholdUsd: s.otpThresholdUsd,
                  depositDailyCapUsd: s.depositDailyCapUsd,
                  savingsRate: s.savingsRate,
                  referralBonusUsd: s.referralBonusUsd,
                  fixedDepositRates: s.fixedDepositRates,
                  fixedDepositPenaltyPercent: s.fixedDepositPenaltyPercent,
                  lowBalanceUsd: s.lowBalanceUsd,
                })
              }
            >
              Save thresholds
            </Button>
          )}
        </Card>

        <Card>
          <CardHeader title="Fees (USD, converted per account currency)" subtitle="Fee = flat + percent × amount, bounded by min and max (max 0 = no cap)." />
          <Table head={['Service', 'Flat', '%', 'Min', 'Max']}>
            {Object.entries(s.fees).map(([k, f]) => (
              <tr key={k}>
                <Td className="font-semibold capitalize">{k.replace(/([A-Z])/g, ' $1')}</Td>
                {(['flat', 'percent', 'min', 'max'] as const).map((p) => (
                  <Td key={p}>
                    <Input disabled={readOnly} className="h-9 w-20" value={String(f[p])} onChange={(e) => setS({ ...s, fees: { ...s.fees, [k]: { ...f, [p]: num(e.target.value) } } })} />
                  </Td>
                ))}
              </tr>
            ))}
          </Table>
          {!readOnly && (
            <Button className="mt-4" loading={busy} onClick={() => save({ fees: s.fees }, 'Fees saved')}>
              Save fees
            </Button>
          )}
        </Card>

        <Card>
          <CardHeader title="Limits by KYC level (USD)" />
          <Table head={['Level', 'Label', 'Daily', 'Per transaction']}>
            {Object.entries(s.kycLimits).map(([lvl, l]) => (
              <tr key={lvl}>
                <Td className="font-semibold">L{lvl}</Td>
                <Td>
                  <Input disabled={readOnly} className="h-9" value={l.label} onChange={(e) => setS({ ...s, kycLimits: { ...s.kycLimits, [lvl]: { ...l, label: e.target.value } } })} />
                </Td>
                <Td>
                  <Input disabled={readOnly} className="h-9 w-28" value={String(l.dailyUsd)} onChange={(e) => setS({ ...s, kycLimits: { ...s.kycLimits, [lvl]: { ...l, dailyUsd: num(e.target.value) } } })} />
                </Td>
                <Td>
                  <Input disabled={readOnly} className="h-9 w-28" value={String(l.singleUsd)} onChange={(e) => setS({ ...s, kycLimits: { ...s.kycLimits, [lvl]: { ...l, singleUsd: num(e.target.value) } } })} />
                </Td>
              </tr>
            ))}
          </Table>
          {!readOnly && (
            <Button className="mt-4" loading={busy} onClick={() => save({ kycLimits: s.kycLimits }, 'Limits saved')}>
              Save limits
            </Button>
          )}
        </Card>
      </div>

      {maint && <MaintenanceModal current={s} onClose={() => setMaint(false)} onSave={(p) => save(p, p.maintenanceMode ? 'Maintenance mode enabled' : 'Maintenance mode disabled').then(() => setMaint(false))} />}
    </>
  );
}

function MaintenanceModal({ current, onClose, onSave }: { current: Settings; onClose: () => void; onSave: (p: Partial<Settings>) => Promise<void> }) {
  const turningOn = !current.maintenanceMode;
  const [message, setMessage] = useState(current.maintenanceMessage);
  const [eta, setEta] = useState(current.maintenanceEta?.slice(0, 16) ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={turningOn ? 'Enable maintenance mode' : 'Disable maintenance mode'}
      footer={
        <Button
          variant={turningOn ? 'danger' : 'primary'}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await onSave({ maintenanceMode: turningOn, maintenanceMessage: message, maintenanceEta: eta ? new Date(eta).toISOString() : null });
            setBusy(false);
          }}
        >
          {turningOn ? 'Enable now' : 'Bring the bank back online'}
        </Button>
      }
    >
      {turningOn && (
        <Alert tone="warning" className="mb-4">
          All customers will immediately lose access to banking features until you turn this off.
        </Alert>
      )}
      <div className="space-y-4">
        <Field label="Message shown to customers">
          <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <Field label="Expected back (optional)">
          <Input type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
