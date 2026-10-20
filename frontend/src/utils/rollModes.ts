/**
 * The roll-mode selector the roll pickers share: Normal, Advantage or
 * Disadvantage, as each game system names them.
 */

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

const DEFAULT_LABELS: Record<RollMode, string> = { normal: 'Normal', advantage: 'Advantage', disadvantage: 'Disadvantage' };

const MODE_LABELS: Record<string, Record<RollMode, string>> = {
  DND_5E: DEFAULT_LABELS,
  PATHFINDER_2E: { normal: 'Normal', advantage: 'Fortune', disadvantage: 'Misfortune' },
  // The selector is hidden for Call of Cthulhu (systemSupportsAdvantage), so
  // a roll there is always Normal; these name its own dice for completeness.
  CALL_OF_CTHULHU_7E: { normal: 'Normal', advantage: 'Bonus Die', disadvantage: 'Penalty Die' },
};

export function getModeLabels(gameSystem: string | null): Record<RollMode, string> {
  return MODE_LABELS[gameSystem ?? ''] ?? DEFAULT_LABELS;
}

/** Whether the system rolls a d20 twice for advantage or disadvantage, so the selector is shown. */
export function systemSupportsAdvantage(gameSystem: string | null): boolean {
  return gameSystem === 'DND_5E' || gameSystem === 'PATHFINDER_2E';
}
