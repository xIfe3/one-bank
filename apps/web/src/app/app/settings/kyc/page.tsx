'use client';

import { Alert, Button, Card, CardHeader, Field, Input, Select, Skeleton, StatusBadge, cn, fmtDateTime } from '@onebank/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FileCheck2, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { handleError } from '@/lib/form';

interface Kyc {
  kycLevel: number;
  submissions: { id: string; level: number; idType: string; status: string; reviewNote: string | null; createdAt: string; reviewedAt: string | null }[];
}

const LEVELS = [
  { level: 1, title: 'Basic', req: 'Email, phone and date of birth', limit: '$500/day' },
  { level: 2, title: 'Verified', req: 'Government ID + selfie', limit: '$10,000/day · wires · loans' },
  { level: 3, title: 'Premium', req: 'Proof of address', limit: '$50,000/day' },
];

export default function KycPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['kyc'], queryFn: () => api.get<Kyc>('/kyc') });
  const [idType, setIdType] = useState('PASSPORT');
  const [idNumber, setIdNumber] = useState('');
  const [doc, setDoc] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  if (isLoading || !data) return <Skeleton className="h-96" />;
  const next = data.kycLevel + 1;
  const pending = data.submissions.find((s) => s.status === 'PENDING');

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <Card>
        <CardHeader title="Verification level" subtitle={`You are at level ${data.kycLevel}`} />
        <ol className="space-y-4">
          {LEVELS.map((l) => {
            const done = data.kycLevel >= l.level;
            return (
              <li key={l.level} className={cn('flex gap-4 rounded-2xl border p-4', done ? 'border-emerald-100 bg-emerald-50/50' : l.level === next ? 'border-gold-300 bg-gold-50/50' : 'border-navy-100')}>
                <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full font-bold', done ? 'bg-success text-white' : 'bg-navy-100 text-navy-500')}>{done ? <Check className="h-4 w-4" /> : l.level}</span>
                <div>
                  <p className="font-semibold text-navy-800">
                    Level {l.level} · {l.title}
                  </p>
                  <p className="text-sm text-navy-500">{l.req}</p>
                  <p className="text-xs font-semibold text-gold-700">{l.limit}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
      <div className="space-y-6">
        {data.kycLevel >= 3 ? (
          <Card className="text-center">
            <FileCheck2 className="mx-auto h-12 w-12 text-success" />
            <p className="mt-3 font-serif text-xl text-navy-800">You’re fully verified</p>
            <p className="text-sm text-navy-500">Enjoy the highest limits One Bank offers.</p>
          </Card>
        ) : pending ? (
          <Alert tone="info" title={`Level ${pending.level} verification under review`}>
            Submitted {fmtDateTime(pending.createdAt)}. Reviews usually take less than 24 hours — we’ll notify you.
          </Alert>
        ) : next < 2 ? (
          <Alert tone="info">Complete your profile with a phone number and date of birth to reach level 1.</Alert>
        ) : (
          <Card>
            <CardHeader title={`Upgrade to level ${next}`} subtitle={next === 2 ? 'Upload a government ID and a selfie holding it.' : 'Upload a recent utility bill or bank statement (last 3 months).'} />
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Document type">
                  <Select value={idType} onChange={(e) => setIdType(e.target.value)}>
                    {(next === 2
                      ? [
                          ['PASSPORT', 'Passport'],
                          ['DRIVERS_LICENSE', 'Driver’s licence'],
                          ['NATIONAL_ID', 'National ID card'],
                        ]
                      : [
                          ['UTILITY_BILL', 'Utility bill'],
                          ['BANK_STATEMENT', 'Bank statement'],
                        ]
                    ).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={next === 2 ? 'Document number' : 'Reference / account number'}>
                  <Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
                </Field>
              </div>
              {[
                ['Document', doc, setDoc, true],
                ...(next === 2 ? [['Selfie holding your ID', selfie, setSelfie, true]] : []),
              ].map(([label, file, setFile]) => (
                <Field key={label as string} label={label as string} hint="JPG, PNG, WEBP or PDF up to 5 MB">
                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-navy-200 p-4 text-sm text-navy-500 hover:border-gold-500">
                    <Upload className="h-5 w-5" /> {(file as File | null)?.name ?? 'Choose file'}
                    <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={(e) => (setFile as (f: File | null) => void)(e.target.files?.[0] ?? null)} />
                  </label>
                </Field>
              ))}
              <Button
                variant="gold"
                loading={busy}
                disabled={!doc || idNumber.length < 4 || (next === 2 && !selfie)}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const fd = new FormData();
                    fd.set('level', String(next));
                    fd.set('idType', idType);
                    fd.set('idNumber', idNumber);
                    fd.set('document', doc!);
                    if (selfie) fd.set('selfie', selfie);
                    await api.post('/kyc', fd);
                    toast.success('Submitted for review');
                    qc.invalidateQueries({ queryKey: ['kyc'] });
                  } catch (e) {
                    handleError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Submit for review
              </Button>
            </div>
          </Card>
        )}
        {data.submissions.length > 0 && (
          <Card>
            <CardHeader title="History" />
            <div className="divide-y divide-navy-50">
              {data.submissions.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-navy-800">
                      Level {s.level} · {s.idType.replace(/_/g, ' ').toLowerCase()}
                    </p>
                    <p className="text-xs text-navy-400">
                      {fmtDateTime(s.createdAt)}
                      {s.reviewNote && ` · ${s.reviewNote}`}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
