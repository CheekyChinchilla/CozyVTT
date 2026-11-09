// ============================================
// Game System Badge
// Display badge for game system with color coding
// ============================================

import type { GameSystem } from '@/types';
import {
  FLEXIBLE_SYSTEM_LABEL,
  GAME_SYSTEM_SHORT_LABELS,
  GAME_SYSTEM_TINTS,
  getGameSystemLabel,
  isGameSystem,
} from '@/constants/game-systems';

interface GameSystemBadgeProps {
  gameSystem: GameSystem | null;
  size?: 'sm' | 'md' | 'lg';
  showFull?: boolean; // Show full label vs short label
}

/** No game system's colours: a Flexible sheet, or a code this build does not know. */
const PLAIN_COLORS = { bg: 'bg-surface', text: 'text-ink-muted', border: 'border-ink/20' };

export default function GameSystemBadge({
  gameSystem,
  size = 'md',
  showFull = false,
}: GameSystemBadgeProps) {
  // A code this build does not know, such as one read from a character file
  // made on an instance with another system, is shown as it is written.
  const known = isGameSystem(gameSystem) ? gameSystem : null;
  const colors = known ? GAME_SYSTEM_TINTS[known] : PLAIN_COLORS;
  const label = known
    ? showFull ? getGameSystemLabel(known) : GAME_SYSTEM_SHORT_LABELS[known]
    : gameSystem || FLEXIBLE_SYSTEM_LABEL;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 border
                 ${colors.bg} ${colors.text} ${colors.border}
                 ${size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-sm font-medium' : 'text-xs font-medium'}`}
      title={known && !showFull ? getGameSystemLabel(known) : undefined}
    >
      {label}
    </span>
  );
}
