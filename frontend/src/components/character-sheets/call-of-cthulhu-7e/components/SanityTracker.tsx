/**
 * SanityTracker Component
 *
 * Visual sanity tracker with current/starting/maximum values.
 * Shows danger zones and current status with a progress bar.
 */

import React from 'react';
import { Brain, AlertTriangle, Skull } from 'lucide-react';
import NumberField from '../../../ui/NumberField';

interface SanityTrackerProps {
  /** Current sanity points */
  current: number;

  /** Starting sanity (usually equal to POW) */
  starting: number;

  /** Maximum sanity (99 - Cthulhu Mythos skill) */
  maximum: number;

  /** Cthulhu Mythos skill value (for display) */
  cthulhuMythos?: number;

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
  cthulhuMythos = 0,
  editable = false,
  onChange,
}) => {
  // Calculate percentage for progress bar
  const percentage = maximum > 0 ? Math.round((current / maximum) * 100) : 0;

  // Determine danger level and color. The fills are tints, as the numbers sit
  // on them; Shaken and Fragile share the warning colour, Fragile at the
  // stronger tint and with the warning icon.
  const getDangerLevel = () => {
    const ratio = current / maximum;
    if (ratio > 0.75) return { level: 'Stable', color: 'bg-success/50', text: 'text-success-ink' };
    if (ratio > 0.5) return { level: 'Shaken', color: 'bg-warning/35', text: 'text-warning-ink' };
    if (ratio > 0.25) return { level: 'Fragile', color: 'bg-warning/70', text: 'text-warning-ink' };
    return { level: 'Breaking', color: 'bg-danger/50', text: 'text-danger-ink' };
  };

  const dangerLevel = getDangerLevel();

  return (
    <div className="bg-spirit/10 border-2 border-spirit/30 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
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
              max={maximum}
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
          {cthulhuMythos > 0 && (
            <div className="text-[10px] text-ink-muted mt-0.5">
              (99 - {cthulhuMythos} Mythos)
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
              Warning: Your investigator is approaching total madness. Losing more SAN may result in indefinite insanity.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SanityTracker;
