import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';
import '../../../../packages/ui/fonts.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100'),
  title: { default: 'One Bank — Private-grade banking for everyone', template: '%s · One Bank' },
  description: 'Multi-currency accounts, instant transfers, virtual cards, savings and loans — with private-banking security. Open a One Bank account in minutes.',
  openGraph: {
    title: 'One Bank — Private-grade banking for everyone',
    description: 'Multi-currency accounts, instant transfers, virtual cards, savings and loans.',
    siteName: 'One Bank',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = { themeColor: '#0B1B3F' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Self-hosted Caslon + Franklin (see packages/ui/fonts.css) */}
        <link rel="preload" href="/fonts/libre-franklin-100-900-normal-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/libre-caslon-display-400-normal-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
