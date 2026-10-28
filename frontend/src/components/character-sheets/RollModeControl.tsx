/**
 * A sheet's Roll mode: Normal, Advantage or Disadvantage (Fortune and
 * Misfortune in Pathfinder 2e) for every d20 test a click or a tap on the
 * sheet rolls, until it is changed. The mode in force is pressed, and marked
 * in the warning colour while it is anything but Normal, so a mode left on
 * is seen. The sheet viewer holds it and shows this where the sheet rolls
 * and its system has the rule.
 */

import { useId } from 'react';
import { getModeLabels, ROLL_MODES, type RollMode } from '@/utils/rollModes';

interface RollModeControlProps {
  mode: RollMode;
  onChange: (mode: RollMode) => void;
  gameSystem: string | null;
  className?: string;
}

export function RollModeControl({ mode, onChange, gameSystem, className = '' }: RollModeControlProps) {
  const labelId = useId();
  const labels = getModeLabels(gameSystem);

  return (
    <div role="group" aria-labelledby={labelId} className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      <span id={labelId} className="text-xs text-warm-gray">Roll mode</span>
      <div className="inline-flex rounded-lg border border-moss-green/30 bg-paper/60 overflow-hidden">
        {ROLL_MODES.map((option) => {
          const pressed = option === mode;
          const look = !pressed
            ? 'text-stone-gray hover:bg-moss-green/10'
            : option === 'normal'
              ? 'bg-moss-green/15 text-brand-ink font-semibold'
              : 'bg-warning/15 text-warning-ink font-semibold';
          return (
            <button
              key={option}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange(option)}
              className={`touch-target px-2.5 py-1.5 text-sm border-l border-moss-green/30 first:border-l-0 transition-colors ${look}`}
            >
              {labels[option]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
