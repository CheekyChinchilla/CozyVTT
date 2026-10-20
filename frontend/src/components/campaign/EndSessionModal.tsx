/**
 * End Session Modal
 * Session State Management
 *
 * Confirmation modal for ending a session.
 * Allows DM to choose whether to save game state and add session notes.
 * Shows session summary (duration, session number).
 */

import { useState } from 'react';
import { Square, Save, Clock, Hash } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { formatDuration } from '@/utils/format';

/** How long ago, in milliseconds, the session started. */
function timeSince(startedAt: string): number {
  return Date.now() - new Date(startedAt).getTime();
}

// ============================================
// Props
// ============================================

interface EndSessionModalProps {
  session: {
    id: string;
    sessionNumber: number;
    startedAt: string;
  };
  onConfirm: (saveState: boolean, notes: string) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
}

// ============================================
// Component
// ============================================

export default function EndSessionModal({
  session,
  onConfirm,
  onClose,
  isSubmitting,
}: EndSessionModalProps) {
  const [saveState, setSaveState] = useState(true);
  const [notes, setNotes] = useState('');

  const duration = formatDuration(timeSince(session.startedAt), 'words');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm(saveState, notes);
  };

  return (
    <Modal open onClose={onClose} title="End Session" icon={Square} size="sm" closeDisabled={isSubmitting}>
      <div className="space-y-5">
        <p className="text-xs text-ink-muted -mt-4">Campaign will become inactive until the next session.</p>

        {/* Session Summary */}
        <div className="rounded-lg bg-parchment border border-moss-green/20 p-4 space-y-3">
          <p className="text-xs font-semibold text-stone-gray uppercase tracking-wide">Session Summary</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Hash className="w-3.5 h-3.5 text-accent-ink shrink-0" />
              <div>
                <p className="text-xs text-warm-gray">Session</p>
                <p className="text-sm font-semibold text-stone-gray">#{session.sessionNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-accent-ink shrink-0" />
              <div>
                <p className="text-xs text-warm-gray">Duration</p>
                <p className="text-sm font-semibold text-stone-gray">{duration}</p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Save State Toggle */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="mt-0.5">
              <input
                type="checkbox"
                checked={saveState}
                onChange={(e) => setSaveState(e.target.checked)}
                disabled={isSubmitting}
                className="w-4 h-4 rounded-sm border-moss-green/30 text-brand-ink focus:ring-moss-green/50 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Save className="w-3.5 h-3.5 text-brand-ink" />
                <span className="text-sm font-medium text-stone-gray">Save game state</span>
              </div>
              <p className="text-xs text-warm-gray mt-0.5">
                Keeps a snapshot of the current map's tokens, the vibe and the spirit layer with this session's record. Play always continues from the live table.
              </p>
            </div>
          </label>

          {/* Session Notes */}
          <div>
            <label className="block text-xs font-medium text-stone-gray mb-1.5">
              Session Notes
              <span className="ml-1 font-normal text-warm-gray">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              rows={3}
              maxLength={2000}
              placeholder="What happened this session? Any notes for next time..."
              className="input-cozy w-full resize-none text-sm"
            />
            <p className="text-xs text-warm-gray mt-1 text-right">{notes.length}/2000</p>
            <p className="text-xs text-warm-gray/70 mt-1">
              Saved with this session and shown to everyone in the campaign under
              <span className="font-medium"> Session → Past Sessions</span>, so your players
              can read back what happened.
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              loading={isSubmitting}
              icon={Square}
              className="text-sm"
            >
              {isSubmitting ? 'Ending...' : 'End Session'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
