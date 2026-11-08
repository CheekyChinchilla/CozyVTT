// ============================================
// Game System Badge
// Display badge for game system with color coding
// ============================================

import type { GameSystem } from '@/types';
import { FLEXIBLE_SYSTEM_LABEL, getGameSystemLabel, isGameSystem } from '@/constants/game-systems';

interface GameSystemBadgeProps {
  gameSystem: GameSystem | null;
  size?: 'sm' | 'md' | 'lg';
  showFull?: boolean; // Show full label vs short label
}

/**
 * Color schemes for each game system.
 *
 * These use the semantic tokens purely as a set of four distinguishable, themed
 * hues — a D&D badge is not "danger", it just needs to look different from a
 * Pathfinder one and stay readable on every theme.
 */
const GAME_SYSTEM_COLORS: Record<GameSystem, { bg: string; text: string; border: string }> = {
  DND_5E: {
    bg: 'bg-danger/10',
    text: 'text-danger-ink',
    border: 'border-danger/30',
  },
  PATHFINDER_2E: {
    bg: 'bg-info/10',
    text: 'text-info-ink',
    border: 'border-info/30',
  },
  SHADOWRUN_6E: {
    bg: 'bg-spirit/10',
    text: 'text-spirit-ink',
    border: 'border-spirit/30',
  },
  CALL_OF_CTHULHU_7E: {
    bg: 'bg-success/10',
    text: 'text-success-ink',
    border: 'border-success/30',
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
  const colors = known ? GAME_SYSTEM_COLORS[known] : PLAIN_COLORS;
  const label = known
    ? showFull ? getGameSystemLabel(known) : SHORT_LABELS[known]
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
