/**
 * StatBlock Component
 *
 * Displays a single ability score with its modifier in a D&D-themed format.
 * When onRoll / onRollContext are provided the block becomes interactive.
 */

import React from 'react';
import { Dices } from 'lucide-react';
import { shouldUseWhiteText } from '@/utils/themeColor';
import { COLOR_PRESETS } from '../colorPresets';

interface StatBlockProps {
  label: string;
  score: number;
  modifier: number;
  // Theme color props (optional, defaults to Classic Red)
  colorFrom?: string;
  colorTo?: string;
  colorHex?: string;
  customColor?: string;
  // Click-to-roll (optional — omit outside campaign context)
  onRoll?: () => void;
  onRollContext?: (e: React.MouseEvent) => void;
}

/**
 * StatBlock - Displays ability score and modifier
 * Styled to look like traditional D&D character sheet stat blocks
 */
export const StatBlock: React.FC<StatBlockProps> = ({
  label,
  score,
  modifier,
  colorFrom = COLOR_PRESETS[0].from,
  colorTo = COLOR_PRESETS[0].to,
  colorHex = COLOR_PRESETS[0].hex,
  customColor,
  onRoll,
  onRollContext,
}) => {
  const formatModifier = (mod: number): string => {
    return mod >= 0 ? `+${mod}` : `${mod}`;
  };

  // Determine circle style and text color
  const isCustomColor = !!customColor;
  const circleStyle = isCustomColor
    ? { background: `linear-gradient(to bottom right, ${customColor}, ${customColor}dd)` }
    : {};
  const circleClasses = isCustomColor
    ? 'w-12 h-12 rounded-full flex items-center justify-center shadow-lg border-2'
    : `w-12 h-12 rounded-full bg-linear-to-br/srgb ${colorFrom} ${colorTo} flex items-center justify-center shadow-lg border-2`;

  const borderColor = isCustomColor ? customColor : colorHex;
  const borderStyle = { borderColor };

  const textColor = isCustomColor
    ? (shouldUseWhiteText(customColor) ? 'text-white' : 'text-black')
    : 'text-white';

  const isClickable = !!onRoll;

  return (
    <div
      className={`flex flex-col items-center space-y-1 rounded-lg p-1 transition-colors group ${
        isClickable ? 'cursor-pointer hover:bg-ink/10 select-none' : ''
      }`}
      onClick={isClickable ? onRoll : undefined}
      onContextMenu={onRollContext}
      title={isClickable ? `Left-click: roll ${label} check  |  Right-click: Advantage / Disadvantage` : undefined}
    >
      {/* Stat Label */}
      <div className="text-xs font-semibold text-ink-secondary uppercase tracking-wide">
        {label}
      </div>

      {/* Modifier Circle */}
      <div className="relative">
        <div className={circleClasses} style={{ ...circleStyle, ...borderStyle }}>
          <span className={`text-xl font-bold ${textColor}`}>
            {formatModifier(modifier)}
          </span>
        </div>
        {/* Dice badge shown on hover when clickable */}
        {isClickable && (
          <div className="absolute -bottom-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="w-4 h-4 rounded-full bg-accent flex items-center justify-center shadow-sm">
              <Dices className="w-2.5 h-2.5 text-accent-text" />
            </div>
          </div>
        )}
      </div>

      {/* Score Box */}
      <div className="px-3 py-1 bg-ink/10 border-2 border-ink/20 rounded-sm">
        <span className="text-sm font-semibold text-ink-secondary">
          {score}
        </span>
      </div>
    </div>
  );
};
