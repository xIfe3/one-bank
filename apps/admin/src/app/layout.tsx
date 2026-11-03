import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import '../../../../packages/ui/fonts.css';
import './globals.css';

export const metadata: Metadata = { title: { default: 'One Bank Admin', template: '%s · One Bank Admin' }, robots: { index: false, follow: false } };

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
