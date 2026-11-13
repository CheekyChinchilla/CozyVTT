// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * CharacteristicBlock Component
 *
 * One characteristic of a Horror d100 character, with the roll it gives at
 * five times its value: Effort for STR, Luck for POW and so on. SIZ gives no
 * roll.
 */

import React from 'react';
import NumberField from '../../../ui/NumberField';
import { Dices } from 'lucide-react';
import { sheetRoll } from '../../useSheetRolls';
import { HORROR_D100_VALUE_MAX } from '@/constants/sheetLimits';
import { horrorD100CharacteristicRoll } from '@/utils/rules/horrorD100';

interface CharacteristicBlockProps {
  /** Characteristic label (e.g., "STR", "CON") */
  label: string;

  /** The characteristic's value; absent where a sheet holds none. */
  value: number | undefined;

  /** The roll the characteristic gives ("Effort"), if it gives one. */
  roll?: string;

  /** Edit mode: Save found the sheet has no value for this characteristic. */
  invalid?: boolean;

  /** Optional edit mode */
  editable?: boolean;

  /** Optional onChange handler for edit mode */
  onChange?: (value: number) => void;

  /** Click to roll. Omit outside campaign context. */
  onRoll?: (expression: string, purpose: string) => void;
}

/**
 * CharacteristicBlock - a characteristic and its roll
 * Format:
 *   [LABEL]
 *   [ VALUE ]
 *   Roll N%
 */
export const CharacteristicBlock: React.FC<CharacteristicBlockProps> = ({
  label,
  value,
  roll,
  invalid = false,
  editable = false,
  onChange,
  onRoll,
}) => {
  const chance = roll !== undefined && typeof value === 'number' ? horrorD100CharacteristicRoll(value) : null;
  const isClickable = !!onRoll && !editable && chance !== null;
  const purpose = `${roll} (${label}×5) — target: ${chance}%`;

  return (
    <div
      className={`flex flex-col items-center space-y-1 rounded-lg p-1 transition-colors group ${isClickable ? 'cursor-pointer hover:bg-ink/5 select-none' : ''}`}
      onClick={isClickable ? () => onRoll!('1d100', purpose) : undefined}
      title={isClickable ? `Click to roll ${roll} (target: ${chance}%)` : undefined}
      {...(isClickable ? sheetRoll : undefined)}
    >
      {/* Label */}
      <div className="flex items-center gap-1 text-xs font-semibold text-ink-secondary uppercase tracking-wider">
        {label}
        {isClickable && <Dices className="w-3 h-3 text-ink-secondary opacity-0 group-hover:opacity-60 [@media(hover:none)]:opacity-60 transition-opacity" />}
      </div>

      {/* Value */}
      <div className={`w-16 h-16 rounded-md border-2 bg-paper flex items-center justify-center ${invalid ? 'border-danger' : 'border-ink/30'}`}>
        {editable ? (
          <NumberField
            aria-label={label}
            value={value}
            onChange={(v: number) => onChange?.(v)}
            className="w-full h-full text-center text-2xl font-bold text-ink bg-transparent border-none focus:outline-hidden focus:ring-2 focus:ring-brand rounded-sm"
            min={0}
            max={HORROR_D100_VALUE_MAX}
            // A characteristic the sheet lacks stays empty until one is typed.
            fallback={value === undefined ? null : 0}
            aria-invalid={invalid}
          />
        ) : (
          <span className="text-2xl font-bold text-ink">{value ?? '—'}</span>
        )}
      </div>

      {/* The roll at five times the characteristic */}
      <div className="h-8 text-center text-xs leading-4 text-ink-secondary">
        {roll !== undefined && (
          <>
            <div>{roll}</div>
            <div className="font-semibold text-ink">{chance === null ? '—' : `${chance}%`}</div>
          </>
        )}
      </div>
    </div>
  );
};

export default CharacteristicBlock;
