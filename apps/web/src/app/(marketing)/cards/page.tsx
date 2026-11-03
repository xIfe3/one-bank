import { Eye, Gauge, Lock, ShoppingBag, Snowflake, Zap } from 'lucide-react';
import type { Metadata } from 'next';
import { CardVisual } from '@/components/marketing';
import { ProductPage } from '@/components/product-page';

export const metadata: Metadata = { title: 'Virtual cards', description: 'Instant Visa and Mastercard virtual cards with limits, freeze and PIN-protected details.' };

export default function Cards() {
  return (
    <ProductPage
      eyebrow="Virtual cards"
      title={<>Cards that answer to you.</>}
      body="Create a Visa or Mastercard virtual card in seconds. Fund it from any account, set a limit, and freeze it with a tap."
      visual={
        <div className="relative w-full max-w-sm">
          <CardVisual color="black" last4="0942" className="absolute -left-8 -top-8 rotate-[-6deg] opacity-80" />
          <CardVisual className="relative rotate-[3deg]" />
        </div>
      }
      features={[
        { icon: <Zap className="h-5 w-5" />, title: 'Issued instantly', body: 'Your card is ready to use the moment you create it.' },
        { icon: <Gauge className="h-5 w-5" />, title: 'Spend limits', body: 'Cap each purchase so subscriptions never surprise you.' },
        { icon: <Snowflake className="h-5 w-5" />, title: 'Freeze & unfreeze', body: 'Lost track of a card? Freeze it instantly and unfreeze whenever you like.' },
        { icon: <Eye className="h-5 w-5" />, title: 'PIN-protected details', body: 'Your full card number and CVV are only revealed after you enter your PIN.' },
        { icon: <ShoppingBag className="h-5 w-5" />, title: 'Shop anywhere online', body: 'Use your card with any merchant that accepts Visa or Mastercard.' },
        { icon: <Lock className="h-5 w-5" />, title: 'Separate balances', body: 'Each card has its own balance, keeping your main account safe.' },
      ]}
      highlights={{ title: 'Transparent card pricing.', points: ['$5 one-time issuance fee', 'No monthly card fees', 'Free top-ups and withdrawals', 'Up to 5 active cards', 'Real-time decline alerts', 'Terminate anytime — balance returned'] }}
    />
  );
}
