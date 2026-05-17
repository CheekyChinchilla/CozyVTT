/**
 * CharacteristicBlock Component
 *
 * Displays a characteristic with regular, half, and fifth values in CoC 7e format.
 */

import React from 'react';
import { Dices } from 'lucide-react';

interface CharacteristicBlockProps {
  /** Characteristic label (e.g., "STR", "CON") */
  label: string;

  /** Regular value */
  regular: number;

  /** Half value (calculated as regular / 2, rounded down) */
  half: number;

  /** Fifth value (calculated as regular / 5, rounded down) */
  fifth: number;

  /** Optional edit mode */
  editable?: boolean;

  /** Optional onChange handler for edit mode */
  onChange?: (value: number) => void;

  /** Click to roll. Omit outside campaign context. */
  onRoll?: (expression: string, purpose: string) => void;
}

/**
 * CharacteristicBlock - Display characteristic with regular/half/fifth values
 * Format:
 *   [LABEL]
 *   [  REG  ]
 *   [ H  | F ]
 */
export const CharacteristicBlock: React.FC<CharacteristicBlockProps> = ({
  label,
  regular,
  half,
  fifth,
  editable = false,
  onChange,
  onRoll,
}) => {
  const isClickable = !!onRoll && !editable;
  const purpose = `${label} Check — target: ${regular}%`;

  return (
    <div
      className={`flex flex-col items-center space-y-1 rounded-lg p-1 transition-colors group ${isClickable ? 'cursor-pointer hover:bg-parchment-light/50 select-none' : ''}`}
      onClick={isClickable ? () => onRoll!('1d100', purpose) : undefined}
      title={isClickable ? `Click to roll ${label} (target: ${regular}%)` : undefined}
    >
      {/* Label */}
      <div className="flex items-center gap-1 text-xs font-semibold text-parchment-dark uppercase tracking-wider">
        {label}
        {isClickable && <Dices className="w-3 h-3 text-sepia-600 opacity-0 group-hover:opacity-60 transition-opacity" />}
      </div>

      {/* Regular Value */}
      <div className="w-16 h-16 rounded-md border-2 border-sepia-600 bg-parchment flex items-center justify-center">
        {editable ? (
          <input
            type="number"
            value={regular}
            onChange={(e) => onChange?.(parseInt(e.target.value) || 0)}
            className="w-full h-full text-center text-2xl font-bold text-sepia-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-sepia-500 rounded"
            min={0}
            max={99}
          />
        ) : (
          <span className="text-2xl font-bold text-sepia-900">{regular}</span>
        )}
      </div>

      {/* Half and Fifth Values */}
      <div className="flex items-center space-x-px">
        {/* Half */}
        <div className="w-8 h-8 rounded-l-md border border-sepia-500 bg-parchment-light flex items-center justify-center">
          <span className="text-sm font-semibold text-sepia-800">{half}</span>
        </div>

        {/* Divider */}
        <div className="h-8 w-px bg-sepia-500"></div>

        {/* Fifth */}
        <div className="w-8 h-8 rounded-r-md border border-sepia-500 bg-parchment-light flex items-center justify-center">
          <span className="text-sm font-semibold text-sepia-800">{fifth}</span>
        </div>
      </div>

      {/* Labels for Half/Fifth */}
      <div className="flex items-center space-x-1 text-[10px] text-sepia-600">
        <span>½</span>
        <span className="text-sepia-400">|</span>
        <span>⅕</span>
      </div>
    </div>
  );
};

export default CharacteristicBlock;
