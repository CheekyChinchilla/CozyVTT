// ============================================
// TemporaryHpDialog
//
// Temporary HP... on a token's menu and on a character's in the roster: how
// many to grant, then the rule for a creature that already has some
// (utils/rules/hitPoints). Temporary hit points never add together, so it
// keeps the ones it has or takes the new ones, and the dialog asks which:
// whoever grants them chooses, the DM for the table. The cursor goes to
// Take M, and both choices carry the question, so a screen reader says it.
// ============================================

import { useId, useState } from 'react';
import { ShieldPlus } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { grantTemporaryHitPoints, MAX_TEMPORARY_HIT_POINTS } from '@/utils/rules/hitPoints';

interface TemporaryHpDialogProps {
  /** Who gets them, as this viewer may name them. */
  name: string;
  /** The temporary hit points they have now. */
  current: number;
  /** The game system whose rule decides a second grant. */
  system: string | null | undefined;
  /** Give them `temporary` temporary hit points in place of any they have. */
  onTake: (temporary: number) => void;
  onClose: () => void;
}

/** A whole number of hit points a grant may give, or null. */
function grantedAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const amount = Number(trimmed);
  return amount >= 1 && amount <= MAX_TEMPORARY_HIT_POINTS ? amount : null;
}

export default function TemporaryHpDialog({ name, current, system, onTake, onClose }: TemporaryHpDialogProps) {
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<{ keep: number; take: number } | null>(null);
  const inputId = useId();
  const questionId = useId();
  const granted = grantedAmount(text);

  const take = (temporary: number) => {
    onTake(temporary);
    onClose();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (granted === null) return;
    const grant = grantTemporaryHitPoints(current, granted, system);
    if (!grant) {
      onClose();
      return;
    }
    if (grant.keep === null) take(grant.take);
    else setChoice({ keep: grant.keep, take: grant.take });
  };

  return (
    <Modal open onClose={onClose} title="Temporary Hit Points" icon={ShieldPlus} size="sm">
      {choice ? (
        <div className="space-y-4">
          <p id={questionId} className="text-sm text-stone-gray">
            {name} already has {choice.keep} temporary hit points. Temporary hit points don't add together: keep the{' '}
            {choice.keep} they have, or take the {choice.take} new ones.
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="secondary" className="touch-target" aria-describedby={questionId} onClick={onClose}>
              Keep {choice.keep}
            </Button>
            <Button type="button" className="touch-target" aria-describedby={questionId} autoFocus onClick={() => take(choice.take)}>
              Take {choice.take}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor={inputId} className="block text-xs font-medium text-stone-gray mb-1.5">
              Temporary hit points for {name}
            </label>
            <input
              id={inputId}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_TEMPORARY_HIT_POINTS}
              step={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              className="input-cozy w-full text-sm pointer-coarse:min-h-11"
            />
            {current > 0 && (
              <p className="text-xs text-warm-gray mt-1">They have {current} now.</p>
            )}
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="secondary" className="touch-target" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="touch-target" disabled={granted === null}>Grant</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
