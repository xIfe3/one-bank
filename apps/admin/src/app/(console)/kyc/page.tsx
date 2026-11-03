'use client';

import { Button, Card, EmptyState, KeyValue, PageHeader, Skeleton, StatusBadge, Tabs, fmtDate, fmtDateTime } from '@onebank/ui';
import { useQuery } from '@tanstack/react-query';
import { FileImage, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ActionModal, type ActionSpec } from '@/components/action-modal';
import { api, can, useAdmin } from '@/lib/api';

interface Sub {
  id: string;
  level: number;
  idType: string;
  idNumber: string;
  documentPath: string;
  selfiePath: string | null;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: { id: string; firstName: string; lastName: string; email: string; dateOfBirth: string | null; country: string; addressLine1: string; city: string; kycLevel: number; createdAt: string };
}

export default function Kyc() {
  const admin = useAdmin();
  const [status, setStatus] = useState('PENDING');
  const [action, setAction] = useState<ActionSpec | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['kyc', status], queryFn: () => api.get<Sub[]>(`/admin/kyc?status=${status}`) });
  const canReview = can(admin, 'ADMIN', 'COMPLIANCE');
  return (
    <>
      <PageHeader title="KYC reviews" subtitle="Verify identity documents to unlock higher customer limits." />
      <Tabs
        className="mb-5 w-fit"
        value={status}
        onChange={setStatus}
        tabs={[
          { value: 'PENDING', label: 'Pending' },
          { value: 'APPROVED', label: 'Approved' },
          { value: 'REJECTED', label: 'Rejected' },
          { value: 'ALL', label: 'All' },
        ]}
      />
      {isLoading ? (
        <Skeleton className="h-60" />
      ) : data?.length ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {data.map((s) => (
            <Card key={s.id}>
              <div className="flex items-start justify-between">
                <div>
                  <Link href={`/users/${s.user.id}`} className="font-serif text-lg text-navy-800 hover:underline">
                    {s.user.firstName} {s.user.lastName}
                  </Link>
                  <p className="text-xs text-navy-400">
                    {s.user.email} · requesting level {s.level} (currently L{s.user.kycLevel})
                  </p>
                </div>
                <StatusBadge status={s.status} />
              </div>
              <KeyValue
                className="mt-4"
                items={[
                  ['Document', `${s.idType.replace(/_/g, ' ').toLowerCase()} · ${s.idNumber}`],
                  ['Date of birth', fmtDate(s.user.dateOfBirth)],
                  ['Address', `${s.user.addressLine1}, ${s.user.city}, ${s.user.country}`],
                  ['Customer since', fmtDate(s.user.createdAt)],
                  ['Submitted', fmtDateTime(s.createdAt)],
                  ...(s.reviewNote ? ([['Review note', s.reviewNote]] as [string, string][]) : []),
                ]}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={<FileImage className="h-4 w-4" />} onClick={() => api.open(`/admin/kyc/files/${s.documentPath}`)}>
                  View document
                </Button>
                {s.selfiePath && (
                  <Button size="sm" variant="secondary" icon={<FileImage className="h-4 w-4" />} onClick={() => api.open(`/admin/kyc/files/${s.selfiePath}`)}>
                    View selfie
                  </Button>
                )}
              </div>
              {s.status === 'PENDING' && canReview && (
                <div className="mt-5 flex gap-2 border-t border-navy-50 pt-4">
                  <Button
                    variant="primary"
                    onClick={() => setAction({ title: `Approve level ${s.level}`, reasonLabel: 'Review note', confirmLabel: 'Approve', success: 'Approved — customer notified', run: (note) => api.post(`/admin/kyc/${s.id}/review`, { approve: true, note }) })}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() =>
                      setAction({ title: 'Reject submission', reasonLabel: 'Reason shown to the customer', confirmLabel: 'Reject', danger: true, success: 'Rejected — customer notified', run: (note) => api.post(`/admin/kyc/${s.id}/review`, { approve: false, note }) })
                    }
                  >
                    Reject
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="Nothing here" body="No submissions in this state." />
        </Card>
      )}
      <ActionModal spec={action} onClose={() => setAction(null)} />
    </>
  );
}
