import { BadgeCheck, CalendarCheck, Calculator, Clock, Percent, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { LoanCalculator } from '@/components/loan-calculator';
import { ProductPage } from '@/components/product-page';

export const metadata: Metadata = { title: 'Loans', description: 'Personal loans with transparent rates, clear schedules and fast decisions.' };

export default function Loans() {
  return (
    <ProductPage
      eyebrow="Loans"
      title={<>Borrow with clarity.</>}
      body="Fixed rates, a clear monthly instalment and no hidden fees. Apply in the app and get a decision fast."
      visual={<LoanCalculator />}
      features={[
        { icon: <Percent className="h-5 w-5" />, title: 'Fixed rates', body: 'Your rate never changes for the life of the loan.' },
        { icon: <Calculator className="h-5 w-5" />, title: 'Know your instalment', body: 'See your exact monthly payment and total cost before you apply.' },
        { icon: <Clock className="h-5 w-5" />, title: 'Fast decisions', body: 'Our team reviews applications quickly, and funds arrive instantly once approved.' },
        { icon: <CalendarCheck className="h-5 w-5" />, title: 'Automatic repayments', body: 'Instalments are collected on the due date — or pay early any time, free.' },
        { icon: <BadgeCheck className="h-5 w-5" />, title: 'No early repayment fees', body: 'Pay off your loan early and save on interest.' },
        { icon: <ShieldCheck className="h-5 w-5" />, title: 'Responsible lending', body: 'We only lend what we believe you can comfortably repay.' },
      ]}
      faqs={[
        ['Who can apply?', 'Customers who have completed identity verification (level 2).'],
        ['What happens if I miss a payment?', 'We will try to collect again and add a small late fee (2% of the instalment). Contact support early if you are struggling — we are here to help.'],
      ]}
    />
  );
}
