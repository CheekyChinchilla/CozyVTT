// ============================================
// ApiKeyReveal — the one time a new key is shown
//
// The server keeps only the key's hash, so this is the person's only chance
// to copy it. Escape and the close button do nothing here; Done is the way
// out, so a stray key press cannot throw the key away.
// ============================================

import { useState } from 'react';
import { AlertTriangle, CheckCircle, Copy, KeyRound } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { copyText } from '@/utils/clipboard';

interface ApiKeyRevealProps {
  /** The key itself, or null when there is nothing to show. */
  secret: string | null;
  name: string;
  /** Whether this replaced an earlier secret, which has stopped working. */
  replaced?: boolean;
  onDone: () => void;
}

export default function ApiKeyReveal({ secret, name, replaced = false, onDone }: ApiKeyRevealProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    if (!secret) return;
    const copied = await copyText(secret);
    setCopyState(copied ? 'copied' : 'failed');
    if (copied) setTimeout(() => setCopyState('idle'), 2000);
  };

  const done = () => {
    setCopyState('idle');
    onDone();
  };

  return (
    <Modal
      open={secret !== null}
      onClose={() => undefined}
      closeDisabled
      title={replaced ? 'Your new key' : 'Your API key'}
      icon={KeyRound}
      footer={
        <Button onClick={done} data-autofocus>
          Done
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-warm-amber/10 border border-warm-amber/30">
          <AlertTriangle className="w-4 h-4 text-accent-ink shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-stone-gray font-medium">
            Copy it now. This is the only time CozyVTT shows it
            {replaced ? ', and the key it replaces has stopped working.' : '.'}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-stone-gray uppercase tracking-wide">{name}</p>
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1 text-xs text-brand-ink hover:text-brand-ink/80"
            >
              {copyState === 'copied' ? <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
              {copyState === 'copied' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <input
            readOnly
            value={secret ?? ''}
            aria-label="API key"
            onFocus={(e) => e.currentTarget.select()}
            className="input-cozy w-full font-mono text-xs"
          />
          {copyState === 'failed' && (
            <p role="status" className="mt-1.5 text-xs text-danger-ink">
              Copy failed. Select the key and copy it by hand.
            </p>
          )}
        </div>

        <p className="text-xs text-warm-gray">
          Send it with each request in the <code className="font-mono text-brand-ink">X-API-Key</code> header. Keep it
          secret: anyone holding it can do what its permissions allow, as you.
        </p>
      </div>
    </Modal>
  );
}
