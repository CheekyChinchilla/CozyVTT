/**
 * SanityTracker Component
 *
 * Visual sanity tracker with current/starting/maximum values.
 * Shows danger zones and current status with a progress bar.
 */

import React from 'react';
import { Brain, AlertTriangle, Skull } from 'lucide-react';

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

  // Determine danger level and color
  const getDangerLevel = () => {
    const ratio = current / maximum;
    if (ratio > 0.75) return { level: 'Stable', color: 'bg-green-600', text: 'text-green-600' };
    if (ratio > 0.5) return { level: 'Shaken', color: 'bg-yellow-500', text: 'text-yellow-600' };
    if (ratio > 0.25) return { level: 'Fragile', color: 'bg-orange-500', text: 'text-orange-600' };
    return { level: 'Breaking', color: 'bg-red-600', text: 'text-red-600' };
  };

  const dangerLevel = getDangerLevel();

  return (
    <div className="bg-gradient-to-br from-purple-900/20 to-indigo-900/20 border-2 border-purple-800/50 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Brain className="w-5 h-5 text-purple-300" />
          <h3 className="text-lg font-bold text-purple-100">Sanity Points</h3>
        </div>
        <div className={`flex items-center space-x-1 ${dangerLevel.text}`}>
          {dangerLevel.level === 'Breaking' && <Skull className="w-4 h-4" />}
          {dangerLevel.level === 'Fragile' && <AlertTriangle className="w-4 h-4" />}
          <span className="text-sm font-semibold">{dangerLevel.level}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative w-full h-8 bg-black/30 rounded-full overflow-hidden border border-purple-700/50">
        {/* Fill */}
        <div
          className={`absolute inset-y-0 left-0 ${dangerLevel.color} transition-all duration-300 ease-out`}
          style={{ width: `${percentage}%` }}
        />

        {/* Percentage Text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-white drop-shadow-lg">
            {current} / {maximum}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        {/* Current */}
        <div className="bg-black/20 rounded-md p-2 border border-purple-700/30">
          <div className="text-xs text-purple-300 uppercase tracking-wide mb-1">Current</div>
          {editable ? (
            <input
              type="number"
              value={current}
              onChange={(e) => onChange?.current(parseInt(e.target.value) || 0)}
              className="w-full text-center text-xl font-bold text-white bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-purple-500 rounded"
              min={0}
              max={maximum}
            />
          ) : (
            <div className="text-xl font-bold text-white">{current}</div>
          )}
        </div>

        {/* Starting */}
        <div className="bg-black/20 rounded-md p-2 border border-purple-700/30">
          <div className="text-xs text-purple-300 uppercase tracking-wide mb-1">Start</div>
          {editable ? (
            <input
              type="number"
              value={starting}
              onChange={(e) => onChange?.starting(parseInt(e.target.value) || 0)}
              className="w-full text-center text-xl font-bold text-purple-100 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-purple-500 rounded"
              min={0}
              max={99}
            />
          ) : (
            <div className="text-xl font-bold text-purple-100">{starting}</div>
          )}
        </div>

        {/* Maximum */}
        <div className="bg-black/20 rounded-md p-2 border border-purple-700/30">
          <div className="text-xs text-purple-300 uppercase tracking-wide mb-1">Max</div>
          <div className="text-xl font-bold text-purple-100">{maximum}</div>
          {cthulhuMythos > 0 && (
            <div className="text-[10px] text-purple-400 mt-0.5">
              (99 - {cthulhuMythos} Mythos)
            </div>
          )}
        </div>
      </div>

      {/* Warning for low sanity */}
      {current <= maximum * 0.25 && (
        <div className="bg-red-900/30 border border-red-700 rounded-md p-2">
          <div className="flex items-center space-x-2 text-red-200 text-xs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
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
