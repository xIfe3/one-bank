'use client';

import { Alert, Button, Modal, PinInput } from '@onebank/ui';
import { useState } from 'react';

/** Simple PIN-only confirmation for non-ledger sensitive actions (reveal, terminate, break). */
export function PinModal({ open, title, description, danger, onClose, onSubmit }: { open: boolean; title: string; description?: string; danger?: boolean; onClose: () => void; onSubmit: (pin: string) => Promise<void> }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setPin('');
    setError(null);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="sm"
      footer={
        <Button
          variant={danger ? 'danger' : 'gold'}
          loading={busy}
          disabled={pin.length !== 4}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onSubmit(pin);
              close();
            } catch (e) {
              setPin('');
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Confirm
        </Button>
      }
    >
      {description && <p className="mb-5 text-sm text-navy-500">{description}</p>}
      <p className="mb-3 text-center text-sm font-medium text-navy-600">Enter your transaction PIN</p>
      <PinInput value={pin} onChange={setPin} autoFocus />
      {error && <Alert tone="danger" className="mt-4">{error}</Alert>}
    </Modal>
  );
}
