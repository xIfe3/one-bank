'use client';

import { PageHeader, cn } from '@onebank/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  ['/app/settings', 'Profile'],
  ['/app/settings/security', 'Security'],
  ['/app/settings/kyc', 'Verification'],
  ['/app/settings/limits', 'Limits'],
  ['/app/settings/notifications', 'Notifications'],
  ['/app/settings/referrals', 'Referrals'],
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your profile, security and preferences." />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-navy-100">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} className={cn('-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition', pathname === href ? 'border-gold-500 text-navy-900' : 'border-transparent text-navy-400 hover:text-navy-700')}>
            {label}
          </Link>
        ))}
      </div>
      {children}
    </>
  );
}
