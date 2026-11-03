import { Button, Logo } from '@onebank/ui';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-navy-deep px-6 text-center text-white">
      <div>
        <Logo light className="justify-center" />
        <p className="mt-12 font-display text-8xl text-gold-400">404</p>
        <h1 className="mt-4 font-display text-3xl">This page has been moved to a safer vault.</h1>
        <p className="mt-3 text-navy-200">The page you are looking for does not exist or is no longer available.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/">
            <Button variant="gold">Back home</Button>
          </Link>
          <Link href="/help">
            <Button variant="outlineLight">
              Help centre
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
