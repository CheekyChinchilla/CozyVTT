// ============================================
// Game System Badge
// Display badge for game system with color coding
// ============================================

import type { GameSystem } from '@/types';
import { getGameSystemLabel } from '@/constants/game-systems';

interface GameSystemBadgeProps {
  gameSystem: GameSystem | null;
  size?: 'sm' | 'md' | 'lg';
  showFull?: boolean; // Show full label vs short label
}

/**
 * Color schemes for each game system
 */
const GAME_SYSTEM_COLORS: Record<GameSystem, { bg: string; text: string; border: string }> = {
  DND_5E: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-300',
  },
  PATHFINDER_2E: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-300',
  },
  SHADOWRUN_6E: {
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    border: 'border-purple-300',
  },
  CALL_OF_CTHULHU_7E: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-300',
  },
};

/**
 * Short labels for badges
 */
const SHORT_LABELS: Record<GameSystem, string> = {
  DND_5E: 'D&D 5e',
  PATHFINDER_2E: 'PF2e',
  SHADOWRUN_6E: 'SR6',
  CALL_OF_CTHULHU_7E: 'CoC 7e',
};

export default function GameSystemBadge({
  gameSystem,
  size = 'md',
  showFull = false,
}: GameSystemBadgeProps) {
  // No badge for null/flexible systems
  if (!gameSystem) {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 border
                   bg-gray-100 text-gray-600 border-gray-300
                   ${size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-sm font-medium' : 'text-xs font-medium'}`}
      >
        Flexible
      </span>
    );
  }

  const colors = GAME_SYSTEM_COLORS[gameSystem];
  const label = showFull ? getGameSystemLabel(gameSystem) : SHORT_LABELS[gameSystem];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 border
                 ${colors.bg} ${colors.text} ${colors.border}
                 ${size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-sm font-medium' : 'text-xs font-medium'}`}
      title={showFull ? undefined : getGameSystemLabel(gameSystem)}
    >
      {label}
    </span>
  );
}
