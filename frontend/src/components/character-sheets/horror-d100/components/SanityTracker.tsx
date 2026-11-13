// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * SanityTracker Component
 *
 * Visual sanity tracker with current/starting/maximum values.
 * Shows danger zones and current status with a progress bar, both judged
 * against the starting value. The four states' names are CozyVTT's own.
 */

import React from 'react';
import { Brain, AlertTriangle, Skull } from 'lucide-react';
import NumberField from '../../../ui/NumberField';

interface SanityTrackerProps {
  /** Current sanity points */
  current: number;

  /** Starting sanity (five times POW on a new character) */
  starting: number;

  /** Maximum sanity (100 less Knowledge (Blasphemous Lore), at most 99) */
  maximum: number;

  /** The Knowledge (Blasphemous Lore) rating (for display) */
  blasphemousLore?: number;

  /** Edit mode */
  editable?: boolean;

  /** onChange handlers for edit mode */
  onChange?: {
    current: (value: number) => void;
    starting: (value: number) => void;
  };
}

/**
 * SanityTracker - Prominent display of sanity with visual indicator
 */
export const SanityTracker: React.FC<SanityTrackerProps> = ({
  current,
  starting,
  maximum,
  blasphemousLore = 0,
  editable = false,
  onChange,
}) => {
  // The state and the bar say how much of the Sanity the character started
  // with is left. Against the maximum they would call a character healthy
  // whose maximum has fallen to what little is left: 1 of 1 would read as
  // full. A sheet with no starting Sanity is judged against its maximum.
  const reference = starting > 0 ? starting : maximum;
  const ratio = reference > 0 ? current / reference : 0;
  const percentage = Math.max(0, Math.min(100, Math.round(ratio * 100)));

  // Determine danger level and color. The fills are tints, as the numbers sit
  // on them; Shaken and Fragile share the warning colour, Fragile at the
  // stronger tint and with the warning icon.
  const getDangerLevel = () => {
    if (ratio > 0.75) return { level: 'Stable', color: 'bg-success/50', text: 'text-success-ink' };
    if (ratio > 0.5) return { level: 'Shaken', color: 'bg-warning/35', text: 'text-warning-ink' };
    if (ratio > 0.25) return { level: 'Fragile', color: 'bg-warning/70', text: 'text-warning-ink' };
    return { level: 'Breaking', color: 'bg-danger/50', text: 'text-danger-ink' };
  };

  const dangerLevel = getDangerLevel();

  return (
    <div className="bg-spirit/10 border-2 border-spirit/30 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <Brain className="w-5 h-5 text-spirit-ink" />
          <h3 className="text-lg font-bold text-spirit-ink">Sanity Points</h3>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-sm font-bold text-ink">
            {current} / {maximum}
          </span>
          <div className={`flex items-center space-x-1 ${dangerLevel.text}`}>
            {dangerLevel.level === 'Breaking' && <Skull className="w-4 h-4" />}
            {dangerLevel.level === 'Fragile' && <AlertTriangle className="w-4 h-4" />}
            <span className="text-sm font-semibold">{dangerLevel.level}</span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {/* The number is above the bar: no one text colour reads on both the
          fill and the track in every theme. */}
      <div className="relative w-full h-4 bg-ink/10 rounded-full overflow-hidden border border-spirit/30">
        <div
          className={`absolute inset-y-0 left-0 ${dangerLevel.color} transition-all duration-300 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        {/* Current */}
        <div className="bg-paper rounded-md p-2 border border-spirit/30">
          <div className="text-xs text-spirit-ink uppercase tracking-wide mb-1">Current</div>
          {editable ? (
            <NumberField
              aria-label="Current Sanity"
              value={current}
              onChange={(v: number) => onChange?.current(Math.min(v, maximum))}
              className="w-full text-center text-xl font-bold text-ink bg-transparent border-none focus:outline-hidden focus:ring-2 focus:ring-brand rounded-sm"
              min={0}
              // A number typed stops at the maximum. One stored above it is
              // left as it is when the box only loses focus.
              max={Math.max(maximum, current)}
              fallback={0}
            />
          ) : (
            <div className="text-xl font-bold text-ink">{current}</div>
          )}
        </div>

        {/* Starting */}
        <div className="bg-paper rounded-md p-2 border border-spirit/30">
          <div className="text-xs text-spirit-ink uppercase tracking-wide mb-1">Start</div>
          {editable ? (
            <NumberField
              aria-label="Starting Sanity"
              value={starting}
              onChange={(v: number) => onChange?.starting(Math.min(v, 99))}
              className="w-full text-center text-xl font-bold text-ink bg-transparent border-none focus:outline-hidden focus:ring-2 focus:ring-brand rounded-sm"
              min={0}
              max={99}
              fallback={0}
            />
          ) : (
            <div className="text-xl font-bold text-ink">{starting}</div>
          )}
        </div>

        {/* Maximum */}
        <div className="bg-paper rounded-md p-2 border border-spirit/30">
          <div className="text-xs text-spirit-ink uppercase tracking-wide mb-1">Max</div>
          <div className="text-xl font-bold text-ink">{maximum}</div>
          {blasphemousLore > 0 && (
            <div className="text-[10px] text-ink-muted mt-0.5">
              (100 − {blasphemousLore} Blasphemous Lore)
            </div>
          )}
        </div>
      </div>

      {/* Warning for low sanity */}
      {current <= maximum * 0.25 && (
        <div className="bg-danger/10 border border-danger/30 rounded-md p-2">
          <div className="flex items-center space-x-2 text-danger-ink text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Sanity is running low. A character whose Sanity reaches 0 is lost to madness for good.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SanityTracker;
