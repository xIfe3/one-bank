import { Bell, Globe2, Repeat, Send, Smartphone, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import { MiniDashboard, ProductPage } from '@/components/product-page';

export const metadata: Metadata = { title: 'Personal accounts', description: 'Free multi-currency personal accounts with instant transfers, cards and savings.' };

export default function Personal() {
  return (
    <ProductPage
      eyebrow="Personal banking"
      title={<>An account that moves as fast as you do.</>}
      body="Hold three major currencies, pay anyone instantly, and see every penny in real time. No monthly fees, no minimum balance."
      visual={
        <MiniDashboard
          rows={[
            ['USD Account', '$12,480.22', '•••• 2853 · Primary'],
            ['EUR Account', '€1,826.20', '•••• 1190'],
            ['GBP Account', '£1,176.15', '•••• 6634'],
          ]}
        />
      }
      features={[
        { icon: <Wallet className="h-5 w-5" />, title: 'Three currencies', body: 'Open USD, EUR and GBP accounts, each with its own account number.' },
        { icon: <Send className="h-5 w-5" />, title: 'Pay by @tag', body: 'Send money to any One Bank member instantly with their @tag or account number.' },
        { icon: <Repeat className="h-5 w-5" />, title: 'Scheduled payments', body: 'Set up one-off or recurring transfers — daily, weekly or monthly.' },
        { icon: <Bell className="h-5 w-5" />, title: 'Real-time alerts', body: 'Instant in-app and email notifications for every credit, debit and sign-in.' },
        { icon: <Globe2 className="h-5 w-5" />, title: 'Spend abroad', body: 'Convert at transparent rates with a small, clearly displayed spread.' },
        { icon: <Smartphone className="h-5 w-5" />, title: 'Statements on demand', body: 'Download beautiful PDF statements or CSV exports for any period.' },
      ]}
      highlights={{
        title: 'Everything included, as standard.',
        points: ['No monthly account fees', 'Free instant transfers to One Bank members', 'Up to 5 virtual cards', 'Savings goals with monthly interest', 'Spending analytics by category', 'Downloadable receipts for every transaction'],
      }}
      faqs={[
        ['How long does it take to open an account?', 'Most people are done in under five minutes. Verify your email and your first account is created immediately.'],
        ['Are there limits on what I can send?', 'Limits depend on your verification level, from $500/day for basic accounts up to $50,000/day for fully verified customers.'],
        ['Can I have more than one currency?', 'Yes — open one account per supported currency at any time from the Accounts page.'],
      ]}
    />
  );
}
