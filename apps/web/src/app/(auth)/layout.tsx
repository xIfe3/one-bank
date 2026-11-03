import { Logo } from '@onebank/ui';
import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { CardVisual } from '@/components/marketing';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-navy-deep p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-32 top-1/3 h-96 w-96 rounded-full bg-gold-500/20 blur-3xl" />
        <Link href="/">
          <Logo light />
        </Link>
        <div className="relative">
          <CardVisual className="rotate-[-4deg]" />
          <h2 className="mt-14 max-w-md font-display text-4xl leading-tight">Private-grade banking, for everyone.</h2>
          <p className="mt-4 max-w-md text-navy-200">Multi-currency accounts, instant transfers and virtual cards — protected by two-factor authentication and device controls.</p>
        </div>
        <p className="relative flex items-center gap-2 text-sm text-navy-300">
          <ShieldCheck className="h-4 w-4 text-gold-400" /> One Bank will never ask for your PIN or one-time codes.
        </p>
      </aside>
      <main className="flex min-h-screen flex-col bg-ivory">
        <div className="flex items-center justify-between p-6 lg:hidden">
          <Link href="/">
            <Logo />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-md animate-fade-up">{children}</div>
        </div>
      </main>
    </div>
  );
}
