'use client';

import { formatMoney } from '@onebank/shared';
import { Avatar, Card, Input, PageHeader, Pagination, Select, Skeleton, StatusBadge, Table, Td, fmtDate, qs } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type Paged } from '@/lib/api';

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  country: string;
  status: string;
  kycLevel: number;
  tag: string | null;
  twoFactorEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  wallets: { currency: string; balance: string; accountNumber: string }[];
}

export default function Users() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [kyc, setKyc] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isLoading } = useQuery({ queryKey: ['users', debounced, status, kyc, page], queryFn: () => api.get<Paged<UserRow>>(`/admin/users${qs({ q: debounced, status, kycLevel: kyc, page })}`) });
  return (
    <>
      <PageHeader title="Users" subtitle={data ? `${data.total.toLocaleString()} customers` : undefined} />
      <Card className="mb-4" padded={false}>
        <div className="grid gap-3 p-4 sm:grid-cols-[1fr_200px_160px]">
          <Input prefix={<Search className="h-4 w-4" />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone, @tag or account number" />
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="">All statuses</option>
            {['ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED', 'BLOCKED', 'CLOSED'].map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ').toLowerCase()}
              </option>
            ))}
          </Select>
          <Select value={kyc} onChange={(e) => (setKyc(e.target.value), setPage(1))}>
            <option value="">Any KYC level</option>
            {[0, 1, 2, 3].map((l) => (
              <option key={l} value={l}>
                Level {l}
              </option>
            ))}
          </Select>
        </div>
      </Card>
      <Card>
        {isLoading ? (
          <Skeleton className="h-80" />
        ) : (
          <>
            <Table head={['Customer', 'Status', 'KYC', 'Balances', 'Country', 'Joined', 'Last sign-in']}>
              {data?.items.map((u) => (
                <tr key={u.id} className="hover:bg-ivory">
                  <Td>
                    <Link href={`/users/${u.id}`} className="flex items-center gap-3">
                      <Avatar name={`${u.firstName} ${u.lastName}`} />
                      <span>
                        <span className="block font-semibold text-navy-800">
                          {u.firstName} {u.lastName}
                        </span>
                        <span className="text-xs text-navy-400">
                          {u.email}
                          {u.tag && ` · @${u.tag}`}
                        </span>
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    <StatusBadge status={u.status} />
                  </Td>
                  <Td>L{u.kycLevel}</Td>
                  <Td className="text-xs">
                    {u.wallets.map((w) => (
                      <span key={w.accountNumber} className="block">
                        {formatMoney(w.balance, w.currency)}
                      </span>
                    ))}
                  </Td>
                  <Td>{u.country}</Td>
                  <Td>{fmtDate(u.createdAt)}</Td>
                  <Td>{u.lastLoginAt ? fmtDate(u.lastLoginAt) : '—'}</Td>
                </tr>
              ))}
            </Table>
            {data && <Pagination page={data.page} pages={data.pages} onChange={setPage} />}
          </>
        )}
      </Card>
    </>
  );
}
