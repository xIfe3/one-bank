import { CookieBanner, SiteFooter, SiteHeader } from '@/components/marketing';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen">{children}</main>
      <SiteFooter />
      <CookieBanner />
    </>
  );
}
