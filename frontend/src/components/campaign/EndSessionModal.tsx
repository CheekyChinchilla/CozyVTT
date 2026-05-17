/**
 * End Session Modal
 * Per SOW Section 15: Session State Management
 *
 * Confirmation modal for ending a session.
 * Allows DM to choose whether to save game state and add session notes.
 * Shows session summary (duration, session number).
 */

import { useState } from 'react';
import { X, Square, Save, Clock, Hash } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

// ============================================
// Duration formatter
// ============================================

function formatDuration(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - start);
  const totalMin = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;

  if (h === 0) return `${m} minute${m !== 1 ? 's' : ''}`;
  return `${h} hour${h !== 1 ? 's' : ''} ${m} minute${m !== 1 ? 's' : ''}`;
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
  const modalRef = useFocusTrap(true, onClose);

  const duration = formatDuration(session.startedAt);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm(saveState, notes);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" aria-hidden="true">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-session-title"
        className="glass-panel max-w-md w-full p-6 bg-soft-cream/95 backdrop-blur-md space-y-5"
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <Square className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 id="end-session-title" className="text-lg font-bold text-moss-green">End Session</h2>
              <p className="text-xs text-warm-gray">Campaign will become inactive until the next session.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close dialog"
            className="p-2 rounded-lg hover:bg-stone-gray/10 transition-colors"
          >
            <X className="w-4 h-4 text-stone-gray" />
          </button>
        </div>

        {/* Session Summary */}
        <div className="rounded-lg bg-parchment border border-moss-green/20 p-4 space-y-3">
          <p className="text-xs font-semibold text-stone-gray uppercase tracking-wide">Session Summary</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Hash className="w-3.5 h-3.5 text-warm-amber flex-shrink-0" />
              <div>
                <p className="text-xs text-warm-gray">Session</p>
                <p className="text-sm font-semibold text-stone-gray">#{session.sessionNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-warm-amber flex-shrink-0" />
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
                className="w-4 h-4 rounded border-moss-green/30 text-moss-green focus:ring-moss-green/50 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Save className="w-3.5 h-3.5 text-moss-green" />
                <span className="text-sm font-medium text-stone-gray">Save game state</span>
              </div>
              <p className="text-xs text-warm-gray mt-0.5">
                Saves token positions, map, vibe, and spirit layer for session resume.
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
              Notes are saved with this session's record. Future session history viewing is planned for a later update.
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Square className="w-3.5 h-3.5" />
              {isSubmitting ? 'Ending...' : 'End Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
