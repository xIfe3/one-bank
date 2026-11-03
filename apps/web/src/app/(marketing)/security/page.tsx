import { Activity, Bell, Fingerprint, KeyRound, Lock, MonitorSmartphone, ScanEye, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { CtaBand, FeatureGrid } from '@/components/marketing';

export const metadata: Metadata = { title: 'Security', description: 'How One Bank protects your account and your money.' };

export default function Security() {
  return (
    <>
      <section className="bg-navy-deep pb-20 pt-40 text-white">
        <div className="container-x max-w-3xl">
          <p className="eyebrow text-gold-400">Security</p>
          <h1 className="h-display mt-4">Protection at every layer.</h1>
          <p className="mt-6 text-lg leading-8 text-navy-200">From the moment you sign in to the moment money leaves your account, multiple safeguards work together to keep you safe.</p>
        </div>
      </section>
      <section className="container-x py-20">
        <FeatureGrid
          items={[
            { icon: <Fingerprint className="h-5 w-5" />, title: 'Two-factor authentication', body: 'Protect sign-in with an authenticator app, plus single-use backup codes.' },
            { icon: <KeyRound className="h-5 w-5" />, title: 'Transaction PIN', body: 'Every payment requires your private 4-digit PIN. Five wrong attempts lock payments for 30 minutes.' },
            { icon: <ShieldCheck className="h-5 w-5" />, title: 'Step-up verification', body: 'Larger payments need an extra one-time code sent to you.' },
            { icon: <MonitorSmartphone className="h-5 w-5" />, title: 'Device management', body: 'See every device signed in, where and when — and sign any of them out remotely.' },
            { icon: <Bell className="h-5 w-5" />, title: 'New sign-in alerts', body: 'We email you when your account is accessed from a new device, with a one-click “this wasn’t me” lockdown.' },
            { icon: <ScanEye className="h-5 w-5" />, title: 'Fraud monitoring', body: 'Unusual activity — like large payments from a new device — is flagged and reviewed by our team.' },
            { icon: <Lock className="h-5 w-5" />, title: 'Encryption', body: 'Card details are encrypted at rest with AES-256 and only revealed after PIN verification.' },
            { icon: <Activity className="h-5 w-5" />, title: 'Session protection', body: 'Short-lived sessions with rotating tokens; stolen tokens are detected and revoked automatically.' },
            { icon: <ShieldAlert className="h-5 w-5" />, title: 'Account lockout', body: 'Repeated failed sign-ins temporarily lock your account and alert you by email.' },
          ]}
        />
      </section>
      <section className="bg-white py-20">
        <div className="container-x max-w-3xl">
          <h2 className="h-section text-navy-800">Report suspicious activity</h2>
          <p className="mt-4 text-navy-500">If you think someone has accessed your account, immediately sign out all devices from Settings → Security, change your password, freeze your cards and contact us. Report phishing emails to security@onebank.test.</p>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
