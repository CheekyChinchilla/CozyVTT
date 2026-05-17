/**
 * StatBlock Component
 *
 * Displays a single ability score with its modifier in a D&D-themed format.
 * When onRoll / onRollContext are provided the block becomes interactive.
 */

import React from 'react';
import { Dices } from 'lucide-react';

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
 * Calculate luminance of a hex color to determine if text should be white or black
 */
const shouldUseWhiteText = (hexColor: string): boolean => {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
};

/**
 * StatBlock - Displays ability score and modifier
 * Styled to look like traditional D&D character sheet stat blocks
 */
export const StatBlock: React.FC<StatBlockProps> = ({
  label,
  score,
  modifier,
  colorFrom = 'from-red-700',
  colorTo = 'to-red-900',
  colorHex = '#b91c1c',
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
    : `w-12 h-12 rounded-full bg-gradient-to-br ${colorFrom} ${colorTo} flex items-center justify-center shadow-lg border-2`;

  const borderColor = isCustomColor ? customColor : colorHex;
  const borderStyle = { borderColor };

  const textColor = isCustomColor
    ? (shouldUseWhiteText(customColor) ? 'text-white' : 'text-stone-900')
    : 'text-white';

  const isClickable = !!onRoll;

  return (
    <div
      className={`flex flex-col items-center space-y-1 rounded-lg p-1 transition-colors group ${
        isClickable ? 'cursor-pointer hover:bg-stone-100 select-none' : ''
      }`}
      onClick={isClickable ? onRoll : undefined}
      onContextMenu={onRollContext}
      title={isClickable ? `Left-click: roll ${label} check  |  Right-click: Advantage / Disadvantage` : undefined}
    >
      {/* Stat Label */}
      <div className="text-xs font-semibold text-stone-600 uppercase tracking-wide">
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
            <div className="w-4 h-4 rounded-full bg-red-700 flex items-center justify-center shadow">
              <Dices className="w-2.5 h-2.5 text-white" />
            </div>
          </div>
        )}
      </div>

      {/* Score Box */}
      <div className="px-3 py-1 bg-stone-100 border-2 border-stone-300 rounded">
        <span className="text-sm font-semibold text-stone-700">
          {score}
        </span>
      </div>
    </div>
  );
};
