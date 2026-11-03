'use client';

import { Badge, Button, Card, EmptyState, PageHeader, Pagination, Skeleton, Tabs, cn, fmtDateTime } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Settings } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';

interface N {
  id: string;
  category: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function Notifications() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['notifications', tab, page], queryFn: () => api.get<{ items: N[]; unreadCount: number; page: number; pages: number }>(`/me/notifications?page=${page}&unread=${tab === 'unread'}`) });
  const read = async (ids?: string[]) => {
    await api.post('/me/notifications/read', ids ? { ids } : {});
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <>
            <Link href="/app/settings/notifications">
              <Button variant="ghost" icon={<Settings className="h-4 w-4" />}>
                Preferences
              </Button>
            </Link>
            <Button variant="outline" onClick={() => read()} disabled={!data?.unreadCount}>
              Mark all as read
            </Button>
          </>
        }
      />
      <Tabs
        className="mb-5 w-fit"
        value={tab}
        onChange={(v) => {
          setTab(v);
          setPage(1);
        }}
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread', count: data?.unreadCount },
        ]}
      />
      <Card>
        {isLoading ? (
          <Skeleton className="h-60" />
        ) : data?.items.length ? (
          <>
            <div className="divide-y divide-navy-50">
              {data.items.map((n) => (
                <div key={n.id} className={cn('flex items-start gap-3 py-4', !n.readAt && 'bg-gold-50/30')}>
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-gold-500')} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-navy-800">{n.title}</p>
                      <Badge tone={n.category === 'SECURITY' ? 'danger' : n.category === 'TRANSACTIONS' ? 'gold' : 'neutral'}>{n.category.toLowerCase()}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-navy-500">{n.body}</p>
                    <p className="mt-1 text-xs text-navy-400">{fmtDateTime(n.createdAt)}</p>
                  </div>
                  <div className="flex gap-1">
                    {n.link && (
                      <Link href={n.link} onClick={() => !n.readAt && read([n.id])}>
                        <Button size="sm" variant="ghost">
                          View
                        </Button>
                      </Link>
                    )}
                    {!n.readAt && (
                      <Button size="sm" variant="ghost" onClick={() => read([n.id])}>
                        Mark read
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={data.page} pages={data.pages} onChange={setPage} />
          </>
        ) : (
          <EmptyState icon={<Bell className="h-6 w-6" />} title="You’re all caught up" />
        )}
      </Card>
    </>
  );
}
