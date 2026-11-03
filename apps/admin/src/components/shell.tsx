'use client';

import { Avatar, Logo, Spinner, cn } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BookOpen,
  CreditCard,
  FileSearch,
  FileText,
  Inbox,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  Menu,
  MonitorSmartphone,
  Scale,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Store,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminContext, api, type Admin, type Role } from '@/lib/api';

type NavItem = { href: string; label: string; icon: typeof Users; roles?: Role[]; badge?: 'kyc' | 'review' | 'tickets' | 'loans' };
const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    group: 'Customers',
    items: [
      { href: '/users', label: 'Users', icon: Users },
      { href: '/kyc', label: 'KYC reviews', icon: ShieldCheck, badge: 'kyc' },
      { href: '/support', label: 'Support inbox', icon: LifeBuoy, badge: 'tickets' },
      { href: '/sessions', label: 'Active sessions', icon: MonitorSmartphone },
    ],
  },
  {
    group: 'Money',
    items: [
      { href: '/transactions', label: 'Transactions', icon: FileText },
      { href: '/risk', label: 'Review & fraud', icon: ShieldAlert, badge: 'review' },
      { href: '/ledger', label: 'Ledger & treasury', icon: Scale, roles: ['ADMIN', 'COMPLIANCE'] },
      { href: '/cards', label: 'Cards', icon: CreditCard },
      { href: '/loans', label: 'Loans', icon: Landmark, badge: 'loans' },
    ],
  },
  {
    group: 'Platform',
    items: [
      { href: '/communications', label: 'Communications', icon: Megaphone },
      { href: '/catalog', label: 'Catalog & rates', icon: Store },
      { href: '/inbox', label: 'Website inbox', icon: Inbox },
      { href: '/settings', label: 'System settings', icon: Settings },
      { href: '/team', label: 'Admin team', icon: UserCog },
      { href: '/audit', label: 'Audit log', icon: FileSearch, roles: ['ADMIN', 'COMPLIANCE'] },
    ],
  },
];

interface Counts {
  kpis: { pendingKyc: number; reviewQueue: number; openTickets: number; pendingLoans: number; openFlags: number };
}

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const [mobile, setMobile] = useState(false);
  const { data: admin, isError, isLoading } = useQuery({ queryKey: ['admin-me'], queryFn: () => api.get<Admin>('/admin/auth/me'), retry: false });
  const { data: counts } = useQuery({ queryKey: ['overview'], queryFn: () => api.get<Counts>('/admin/overview'), enabled: !!admin, refetchInterval: 30_000 });
  const { data: status } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<{ maintenanceMode: boolean }>('/admin/settings'), enabled: !!admin, refetchInterval: 30_000 });
  useEffect(() => {
    if (isError) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isError, router, pathname]);
  useEffect(() => setMobile(false), [pathname]);

  if (isLoading || !admin)
    return (
      <div className="grid min-h-screen place-items-center bg-navy-900">
        <Spinner className="h-8 w-8" />
      </div>
    );

  const badge = (b?: NavItem['badge']) => {
    if (!b || !counts) return 0;
    return b === 'kyc' ? counts.kpis.pendingKyc : b === 'review' ? counts.kpis.reviewQueue + counts.kpis.openFlags : b === 'tickets' ? counts.kpis.openTickets : counts.kpis.pendingLoans;
  };

  return (
    <AdminContext.Provider value={admin}>
      <div className="min-h-screen bg-[#F4F5F9]">
        <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy-950 text-navy-300 transition-transform lg:translate-x-0', mobile ? 'translate-x-0' : '-translate-x-full')}>
          <div className="flex h-16 items-center justify-between px-5">
            <Link href="/" className="flex items-center gap-2">
              <Logo light />
              <span className="rounded bg-gold-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-navy-900">Admin</span>
            </Link>
            <button className="lg:hidden" onClick={() => setMobile(false)} aria-label="Close menu">
              <X />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 pb-6">
            {NAV.map((g) => (
              <div key={g.group} className="mt-4">
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-navy-500">{g.group}</p>
                {g.items
                  .filter((i) => !i.roles || admin.role === 'SUPERADMIN' || i.roles.includes(admin.role))
                  .map((i) => {
                    const active = i.href === '/' ? pathname === '/' : pathname.startsWith(i.href);
                    const n = badge(i.badge);
                    return (
                      <Link key={i.href} href={i.href} className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition', active ? 'bg-white/10 font-semibold text-white' : 'hover:bg-white/5 hover:text-white')}>
                        <i.icon className={cn('h-4 w-4', active ? 'text-gold-400' : 'text-navy-500')} />
                        {i.label}
                        {n > 0 && <span className="ml-auto rounded-full bg-gold-500 px-1.5 text-[10px] font-bold text-navy-900">{n}</span>}
                      </Link>
                    );
                  })}
              </div>
            ))}
          </nav>
          <div className="border-t border-white/10 p-3">
            <div className="flex items-center gap-3 px-2 py-2">
              <Avatar name={`${admin.firstName} ${admin.lastName}`} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {admin.firstName} {admin.lastName}
                </p>
                <p className="text-[11px] uppercase tracking-wider text-gold-400">{admin.role}</p>
              </div>
            </div>
            <button
              onClick={async () => {
                await api.post('/admin/auth/logout').catch(() => undefined);
                qc.clear();
                router.replace('/login');
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-white/5 hover:text-white"
            >
              <LogOut className="h-4 w-4 text-navy-500" /> Sign out
            </button>
          </div>
        </aside>
        {mobile && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMobile(false)} />}
        <div className="lg:pl-64">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-navy-100 bg-white/90 px-4 backdrop-blur sm:px-6">
            <button className="lg:hidden" onClick={() => setMobile(true)} aria-label="Open menu">
              <Menu />
            </button>
            <div className="flex items-center gap-2 text-sm text-navy-500">
              <Activity className="h-4 w-4 text-success" /> All actions are recorded in the audit log
            </div>
            <a href={process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3100'} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-navy-900 sm:flex">
              <BookOpen className="h-4 w-4" /> Customer site
            </a>
          </header>
          {status?.maintenanceMode && (
            <div className="bg-amber-500 px-6 py-2 text-center text-sm font-semibold text-navy-900">
              Maintenance mode is ON — customers cannot use the bank. <Link href="/settings" className="underline">Manage</Link>
            </div>
          )}
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
        </div>
      </div>
    </AdminContext.Provider>
  );
}
