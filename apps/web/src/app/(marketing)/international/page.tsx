import { ArrowLeftRight, Building, Clock3, Globe2, Receipt, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { FxCalculator } from '@/components/marketing';
import { ProductPage } from '@/components/product-page';

export const metadata: Metadata = { title: 'International transfers & FX', description: 'Send money abroad with SWIFT wires and exchange currencies at transparent rates.' };

export default function International() {
  return (
    <ProductPage
      eyebrow="International & FX"
      title={<>Move money across borders, not mountains.</>}
      body="Exchange between USD, EUR and GBP at live rates, and send SWIFT wires worldwide with every fee shown up front."
      visual={<FxCalculator className="w-full max-w-md" />}
      features={[
        { icon: <ArrowLeftRight className="h-5 w-5" />, title: 'Live exchange', body: 'Lock a quote for 30 seconds and convert instantly between your accounts.' },
        { icon: <Globe2 className="h-5 w-5" />, title: 'SWIFT wires', body: 'Send to IBAN and SWIFT/BIC accounts in 180+ countries.' },
        { icon: <Receipt className="h-5 w-5" />, title: 'Fees up front', body: '0.5% (min $15, max $150) for wires — shown before you confirm.' },
        { icon: <Clock3 className="h-5 w-5" />, title: 'Track every step', body: 'Follow your wire from submitted to processing to credited.' },
        { icon: <Building className="h-5 w-5" />, title: 'Domestic transfers', body: 'Pay accounts at major banks for a flat $1.50 fee.' },
        { icon: <ShieldCheck className="h-5 w-5" />, title: 'Compliance-reviewed', body: 'Large payments are reviewed by our team to keep your money safe.' },
      ]}
    />
  );
}
