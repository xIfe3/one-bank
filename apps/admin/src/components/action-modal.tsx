'use client';

import { Alert, Button, Field, Modal, Textarea } from '@onebank/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

export interface ActionSpec {
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Whether a written reason is required (most admin actions). */
  reason?: boolean;
  reasonLabel?: string;
  extra?: React.ReactNode;
  run: (reason: string) => Promise<unknown>;
  success: string;
}

/** Every sensitive admin action goes through here: explicit confirmation + audit reason. */
export function ActionModal({ spec, onClose }: { spec: ActionSpec | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!spec) return null;
  const needsReason = spec.reason !== false;
  const close = () => {
    setReason('');
    setError(null);
    onClose();
  };
  return (
    <Modal
      open
      onClose={close}
      title={spec.title}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant={spec.danger ? 'danger' : 'primary'}
            loading={busy}
            disabled={needsReason && reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await spec.run(reason.trim());
                toast.success(spec.success);
                qc.invalidateQueries();
                close();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {spec.confirmLabel}
          </Button>
        </>
      }
    >
      {spec.description && <div className="mb-4 text-sm text-navy-600">{spec.description}</div>}
      {spec.extra}
      {needsReason && (
        <Field label={spec.reasonLabel ?? 'Reason (recorded in the audit log)'}>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why you are taking this action" />
        </Field>
      )}
      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}
    </Modal>
  );
}
