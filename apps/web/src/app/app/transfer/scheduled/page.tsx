'use client';

import { Badge, Button, Card, EmptyState, Money, PageHeader, Skeleton, Table, Td, fmtDateTime } from '@onebank/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { handleError } from '@/lib/form';

interface Scheduled {
  id: string;
  kind: string;
  amount: string;
  currency: string;
  recipientName: string;
  frequency: string;
  nextRunAt: string;
  lastRunAt: string | null;
  lastError: string | null;
  runCount: number;
  active: boolean;
}

export default function ScheduledPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['scheduled'], queryFn: () => api.get<Scheduled[]>('/transfers/scheduled') });
  const cancel = useMutation({
    mutationFn: (id: string) => api.del(`/transfers/scheduled/${id}`),
    onSuccess: () => {
      toast.success('Scheduled transfer cancelled');
      qc.invalidateQueries({ queryKey: ['scheduled'] });
    },
    onError: (e) => handleError(e),
  });
  return (
    <>
      <PageHeader
        back={
          <Link href="/app/transfer" className="mb-2 inline-flex items-center gap-1 text-sm text-navy-500 hover:text-navy-800">
            <ArrowLeft className="h-4 w-4" /> Send money
          </Link>
        }
        title="Scheduled transfers"
        subtitle="One-off and recurring payments run automatically."
      />
      <Card>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : data?.length ? (
          <Table head={['Recipient', 'Amount', 'Repeats', 'Next run', 'Last result', 'Status', '']}>
            {data.map((s) => (
              <tr key={s.id}>
                <Td className="font-semibold text-navy-800">{s.recipientName}</Td>
                <Td>
                  <Money amount={s.amount} currency={s.currency} />
                </Td>
                <Td className="capitalize">{s.frequency.toLowerCase()}</Td>
                <Td>{s.active ? fmtDateTime(s.nextRunAt) : '—'}</Td>
                <Td className="max-w-[240px] truncate text-xs">{s.lastError ? <span className="text-danger">{s.lastError}</span> : s.lastRunAt ? `Sent ${fmtDateTime(s.lastRunAt)}` : 'Not run yet'}</Td>
                <Td>{s.active ? <Badge tone="success">Active</Badge> : <Badge>Ended</Badge>}</Td>
                <Td>
                  {s.active && (
                    <Button size="sm" variant="ghost" loading={cancel.isPending && cancel.variables === s.id} onClick={() => cancel.mutate(s.id)}>
                      Cancel
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState icon={<CalendarClock className="h-6 w-6" />} title="Nothing scheduled" body="Schedule a transfer from the Send money page." action={<Link href="/app/transfer"><Button>Send money</Button></Link>} />
        )}
      </Card>
    </>
  );
}
