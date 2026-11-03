'use client';

import { formatMoney } from '@onebank/shared';
import { Alert, Button, Card, CardHeader, Input, PageHeader, Skeleton, Table, Td } from '@onebank/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, PlusCircle, Scale, Search, XCircle } from 'lucide-react';
import { useState } from 'react';
import { AdjustModal, CustomTxModal, type AccountOpt } from '@/components/ledger-forms';
import { api, can, useAdmin } from '@/lib/api';

interface SystemAccount {
  id: string;
  systemCode: string;
  currency: string;
  balance: string;
}
interface Recon {
  ok: boolean;
  checkedAccounts: number;
  mismatches: { id: string; name: string; balance: string; posted: string; available: string; expectedAvailable: string }[];
  trialBalance: { currency: string; total: string; balanced: boolean }[];
  unbalancedEntries: { entryId: string; currency: string; total: string }[];
}

const DESC: Record<string, string> = {
  BANK_EQUITY: 'Funds deposits, admin credits and bonuses',
  FEES: 'Fee revenue',
  FX_POOL: 'Currency conversion pool',
  INTERBANK_SETTLEMENT: 'Outgoing transfers to other banks',
  BILLS_SETTLEMENT: 'Bill payments owed to billers',
  CARD_SETTLEMENT: 'Card spend owed to networks',
  INTEREST_EXPENSE: 'Interest paid to customers',
  LOAN_PORTFOLIO: 'Loan principal out / repaid',
};

export default function Ledger() {
  const admin = useAdmin();
  const { data, isLoading } = useQuery({ queryKey: ['system-accounts'], queryFn: () => api.get<{ accounts: SystemAccount[] }>('/admin/ledger/system-accounts') });
  const recon = useMutation({ mutationFn: () => api.get<Recon>('/admin/ledger/reconcile') });
  const [lookup, setLookup] = useState('');
  const [found, setFound] = useState<AccountOpt[] | null>(null);
  const [modal, setModal] = useState<'adjust' | 'custom' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const search = async () => {
    setErr(null);
    try {
      const r = await api.get<{ items: { id: string }[] }>(`/admin/users?q=${encodeURIComponent(lookup)}`);
      if (!r.items[0]) throw new Error('No customer found');
      const d = await api.get<{ accounts: AccountOpt[] }>(`/admin/users/${r.items[0].id}`);
      setFound(d.accounts.filter((a) => a.type !== 'LOAN'));
    } catch (e) {
      setErr((e as Error).message);
      setFound(null);
    }
  };

  const codes = [...new Set(data?.accounts.map((a) => a.systemCode))];
  const currencies = [...new Set(data?.accounts.map((a) => a.currency))].sort();

  return (
    <>
      <PageHeader title="Ledger & treasury" subtitle="System accounts, reconciliation and manual postings." actions={<Button variant="gold" icon={<Scale className="h-4 w-4" />} loading={recon.isPending} onClick={() => recon.mutate()}>Run reconciliation</Button>} />
      {recon.data && (
        <Alert tone={recon.data.ok ? 'success' : 'danger'} className="mb-6" title={recon.data.ok ? 'Ledger reconciled — all balanced' : 'Reconciliation found issues'}>
          Checked {recon.data.checkedAccounts} accounts. Trial balance:{' '}
          {recon.data.trialBalance.map((t) => (
            <span key={t.currency} className="mr-3 inline-flex items-center gap-1">
              {t.balanced ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-danger" />} {t.currency} {t.total}
            </span>
          ))}
          {recon.data.mismatches.length > 0 && <p className="mt-1">{recon.data.mismatches.length} account balance mismatch(es).</p>}
          {recon.data.unbalancedEntries.length > 0 && <p className="mt-1">{recon.data.unbalancedEntries.length} unbalanced entries.</p>}
        </Alert>
      )}
      <Card className="mb-6">
        <CardHeader title="System accounts" subtitle="Negative = funds the bank has paid out; positive = funds held. Totals across all accounts net to zero." />
        {isLoading ? (
          <Skeleton className="h-60" />
        ) : (
          <Table head={['Account', ...currencies]}>
            {codes.map((c) => (
              <tr key={c}>
                <Td>
                  <p className="font-mono text-xs font-semibold text-navy-800">{c}</p>
                  <p className="text-xs text-navy-400">{DESC[c] ?? ''}</p>
                </Td>
                {currencies.map((cur) => {
                  const a = data?.accounts.find((x) => x.systemCode === c && x.currency === cur);
                  return (
                    <Td key={cur} className={Number(a?.balance) < 0 ? 'text-danger' : 'text-navy-800'}>
                      {a ? formatMoney(a.balance, cur) : '—'}
                    </Td>
                  );
                })}
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {can(admin, 'ADMIN') && (
        <Card>
          <CardHeader title="Manual posting" subtitle="Find a customer, then credit/debit or add a custom transaction." />
          <div className="flex gap-2">
            <Input prefix={<Search className="h-4 w-4" />} value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="Email, name or account number" onKeyDown={(e) => e.key === 'Enter' && search()} />
            <Button onClick={search} disabled={!lookup}>
              Find
            </Button>
          </div>
          {err && <Alert tone="danger" className="mt-3">{err}</Alert>}
          {found && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-sm text-navy-600">{found.length} account(s) found.</p>
              <Button variant="gold" icon={<PlusCircle className="h-4 w-4" />} onClick={() => setModal('adjust')}>
                Credit / debit
              </Button>
              <Button variant="outline" onClick={() => setModal('custom')}>
                Custom transaction
              </Button>
            </div>
          )}
        </Card>
      )}
      {modal === 'adjust' && found && <AdjustModal accounts={found} onClose={() => setModal(null)} />}
      {modal === 'custom' && found && <CustomTxModal accounts={found} onClose={() => setModal(null)} />}
    </>
  );
}
