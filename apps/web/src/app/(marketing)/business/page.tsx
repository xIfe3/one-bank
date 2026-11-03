import { BarChart3, Building2, FileSpreadsheet, Globe2, ShieldCheck, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { MiniDashboard, ProductPage } from '@/components/product-page';

export const metadata: Metadata = { title: 'Business banking', description: 'Multi-currency business accounts, global payouts and spend controls.' };

export default function Business() {
  return (
    <ProductPage
      eyebrow="Business banking"
      title={<>Run a global business from one account.</>}
      body="Pay suppliers and staff across borders, issue cards for team spend and reconcile everything with clean exports."
      visual={
        <MiniDashboard
          rows={[
            ['Payroll — October', '$84,200.00', '24 recipients · scheduled'],
            ['Supplier — Atelier Lumière', '€12,800.00', 'Wire · completed'],
            ['Marketing cards', '$3,410.55', '3 active virtual cards'],
            ['Fee revenue saved', '$1,204.00', 'vs. legacy bank this quarter'],
          ]}
        />
      }
      features={[
        { icon: <Globe2 className="h-5 w-5" />, title: 'Global payouts', body: 'Domestic transfers and SWIFT wires to 180+ countries with clear fees up front.' },
        { icon: <Users className="h-5 w-5" />, title: 'Team cards', body: 'Issue virtual cards per project or employee with individual spend limits.' },
        { icon: <FileSpreadsheet className="h-5 w-5" />, title: 'Accounting-ready', body: 'CSV exports and PDF statements that drop straight into your bookkeeping.' },
        { icon: <BarChart3 className="h-5 w-5" />, title: 'Cash-flow insights', body: 'Money in vs. money out, top payees and category breakdowns at a glance.' },
        { icon: <ShieldCheck className="h-5 w-5" />, title: 'Approval controls', body: 'Large payments go through compliance review automatically for extra protection.' },
        { icon: <Building2 className="h-5 w-5" />, title: 'Dedicated support', body: 'Priority support tickets with a typical first response under four hours.' },
      ]}
      faqs={[
        ['Can I open a business account today?', 'Business accounts are opened through our team so we can verify your company. Contact us to get started and to discuss multi-user access.'],
        ['Do you support recurring payroll?', 'Yes — schedule recurring transfers weekly or monthly to each employee.'],
      ]}
    />
  );
}
