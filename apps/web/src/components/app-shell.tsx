'use client';

import { Alert, Avatar, Button, Logo, Spinner, cn, timeAgo } from '@onebank/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  CreditCard,
  FileText,
  HelpCircle,
  Home,
  Landmark,
  LifeBuoy,
  LogOut,
  Menu,
  PiggyBank,
  Receipt,
  Settings,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, type Me } from '@/lib/api';
import { MeProvider, useLiveUpdates, useMeQuery } from '@/lib/session';

const NAV = [
  { href: '/app', label: 'Home', icon: Home },
  { href: '/app/accounts', label: 'Accounts', icon: Wallet },
  { href: '/app/transfer', label: 'Send money', icon: ArrowLeftRight },
  { href: '/app/bills', label: 'Pay bills', icon: Receipt },
  { href: '/app/cards', label: 'Cards', icon: CreditCard },
  { href: '/app/savings', label: 'Savings', icon: PiggyBank },
  { href: '/app/loans', label: 'Loans', icon: Landmark },
  { href: '/app/transactions', label: 'Transactions', icon: FileText },
  { href: '/app/beneficiaries', label: 'Beneficiaries', icon: Users },
  { href: '/app/analytics', label: 'Insights', icon: BarChart3 },
  { href: '/app/support', label: 'Support', icon: LifeBuoy },
  { href: '/app/settings', label: 'Settings', icon: Settings },
];

interface Notif {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  category: string;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: me, isLoading, isError } = useMeQuery();
  const [mobile, setMobile] = useState(false);
  useLiveUpdates(!!me);
  useEffect(() => setMobile(false), [pathname]);
  useEffect(() => {
    if (isError) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isError, router, pathname]);

  if (isLoading || !me)
    return (
      <div className="grid min-h-screen place-items-center bg-ivory">
        <div className="flex flex-col items-center gap-4">
          <Logo />
          <Spinner />
        </div>
      </div>
    );

  return (
    <MeProvider me={me}>
      <div className="min-h-screen bg-ivory">
        <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy-900 text-navy-200 transition-transform lg:translate-x-0', mobile ? 'translate-x-0' : '-translate-x-full')}>
          <div className="flex h-16 items-center justify-between px-5">
            <Link href="/app">
              <Logo light />
            </Link>
            <button className="text-navy-300 lg:hidden" onClick={() => setMobile(false)} aria-label="Close menu">
              <X />
            </button>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === '/app' ? pathname === '/app' : pathname.startsWith(href);
              return (
                <Link key={href} href={href} className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition', active ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white')}>
                  <Icon className={cn('h-[18px] w-[18px]', active ? 'text-gold-400' : 'text-navy-400')} />
                  {label}
                  {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold-400" />}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-white/10 p-3">
            <Link href="/help" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-white/5 hover:text-white">
              <HelpCircle className="h-[18px] w-[18px] text-navy-400" /> Help centre
            </Link>
            <LogoutButton />
          </div>
        </aside>
        {mobile && <div className="fixed inset-0 z-30 bg-navy-950/50 lg:hidden" onClick={() => setMobile(false)} />}
        <div className="lg:pl-64">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-navy-100/70 bg-ivory/85 px-4 backdrop-blur-xl sm:px-8">
            <button className="rounded-full p-2 text-navy-700 lg:hidden" onClick={() => setMobile(true)} aria-label="Open menu">
              <Menu />
            </button>
            <p className="hidden text-sm text-navy-400 sm:block">
              {greeting()}, <span className="font-semibold text-navy-800">{me.firstName}</span>
            </p>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <Link href="/app/settings" className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-white">
                <Avatar name={`${me.firstName} ${me.lastName}`} />
                <span className="hidden text-sm font-medium text-navy-800 sm:inline">
                  {me.firstName} {me.lastName.charAt(0)}.
                </span>
              </Link>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
            <AccountBanners me={me} />
            {children}
          </main>
        </div>
      </div>
    </MeProvider>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function AccountBanners({ me }: { me: Me }) {
  const { data: ann } = useQuery({ queryKey: ['announcements'], queryFn: () => api.get<{ id: string; title: string; body: string; variant: string }[]>('/me/announcements'), staleTime: 300_000 });
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => setDismissed(JSON.parse(localStorage.getItem('ob_ann') ?? '[]')), []);
  const banners: React.ReactNode[] = [];
  if (me.status === 'SUSPENDED')
    banners.push(
      <Alert key="s" tone="danger" title="Your account is suspended" action={<Link href="/app/support"><Button size="sm" variant="danger">Contact support</Button></Link>}>
        Outgoing payments are disabled{me.statusReason ? `: ${me.statusReason}` : '.'} You can still view your accounts.
      </Alert>,
    );
  if (!me.hasPin)
    banners.push(
      <Alert key="p" tone="gold" title="Create your transaction PIN" action={<Link href="/app/settings/security"><Button size="sm" variant="primary">Set PIN</Button></Link>}>
        You need a 4-digit PIN to send money, pay bills and use cards.
      </Alert>,
    );
  else if (me.kycLevel < 2)
    banners.push(
      <Alert key="k" tone="info" title="Unlock higher limits" action={<Link href="/app/settings/kyc"><Button size="sm" variant="outline">Verify identity</Button></Link>}>
        Verify your identity to send up to $10,000 a day, make international wires and apply for loans.
      </Alert>,
    );
  for (const a of ann ?? []) {
    if (dismissed.includes(a.id)) continue;
    banners.push(
      <Alert
        key={a.id}
        tone={a.variant === 'WARNING' ? 'warning' : a.variant === 'SUCCESS' ? 'success' : a.variant === 'PROMO' ? 'gold' : 'info'}
        title={a.title}
        action={
          <button
            className="text-xs font-semibold opacity-70 hover:opacity-100"
            onClick={() => {
              const next = [...dismissed, a.id];
              setDismissed(next);
              localStorage.setItem('ob_ann', JSON.stringify(next));
            }}
          >
            Dismiss
          </button>
        }
      >
        {a.body}
      </Alert>,
    );
  }
  if (!banners.length) return null;
  return <div className="mb-6 space-y-3">{banners}</div>;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['notifications', 'bell'], queryFn: () => api.get<{ items: Notif[]; unreadCount: number }>('/me/notifications'), refetchInterval: 60_000 });
  const markAll = useMutation({ mutationFn: () => api.post('/me/notifications/read', {}), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  useEffect(() => {
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  const unread = data?.unreadCount ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="relative rounded-full p-2.5 text-navy-600 hover:bg-white" aria-label={`Notifications (${unread} unread)`}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-navy-900">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[360px] max-w-[calc(100vw-2rem)] animate-fade-up overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-lift">
          <div className="flex items-center justify-between border-b border-navy-50 px-4 py-3">
            <p className="font-serif text-navy-800">Notifications</p>
            {unread > 0 && (
              <button onClick={() => markAll.mutate()} className="text-xs font-semibold text-gold-700 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {data?.items.length ? (
              data.items.slice(0, 8).map((n) => (
                <Link key={n.id} href={n.link ?? '/app/notifications'} onClick={() => setOpen(false)} className={cn('block border-b border-navy-50 px-4 py-3 hover:bg-ivory', !n.readAt && 'bg-gold-50/40')}>
                  <div className="flex items-start gap-2">
                    {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold-500" />}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy-800">{n.title}</p>
                      <p className="truncate text-xs text-navy-500">{n.body}</p>
                      <p className="mt-0.5 text-[11px] text-navy-300">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <p className="px-4 py-10 text-center text-sm text-navy-400">You’re all caught up.</p>
            )}
          </div>
          <Link href="/app/notifications" onClick={() => setOpen(false)} className="block px-4 py-3 text-center text-sm font-semibold text-navy-700 hover:bg-ivory">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

function LogoutButton() {
  const router = useRouter();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await api.post('/auth/logout').catch(() => undefined);
        qc.clear();
        router.replace('/login');
      }}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-white/5 hover:text-white"
    >
      <LogOut className="h-[18px] w-[18px] text-navy-400" /> {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
