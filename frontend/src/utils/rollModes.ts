/**
 * Rolling a d20 test in a mode: Normal, Advantage or Disadvantage, as each
 * game system names them. The roll pickers' Roll mode, a sheet's Roll mode
 * and a sheet's right-click and press-and-hold menu all roll through
 * `applyRollMode`.
 */

import { withAdvantage, withDisadvantage } from './characterRolls';

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

/** The three, in the order every selector lists them. */
export const ROLL_MODES: readonly RollMode[] = ['normal', 'advantage', 'disadvantage'];

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

/**
 * A d20 test (an ability check, a save, a skill, an attack) as it is rolled
 * in `mode`. D&D 5e's advantage and disadvantage, and Pathfinder 2e's fortune
 * and misfortune, roll the d20 twice and keep the higher or the lower, so a
 * leading `1d20` becomes `2d20kh1` or `2d20kl1` and the purpose names the
 * mode, which is how the dice log says so. Normal, a system with no such rule
 * (Call of Cthulhu's bonus and penalty dice are another thing), and a roll
 * that does not begin with one d20 come back as they were. The caller decides
 * what is a test: a damage roll or a hit die is never passed here.
 */
export function applyRollMode(
  expression: string,
  purpose: string,
  mode: RollMode,
  gameSystem: string | null
): { expression: string; purpose: string } {
  if (mode === 'normal' || !systemSupportsAdvantage(gameSystem)) return { expression, purpose };
  const rolled = mode === 'advantage' ? withAdvantage(expression) : withDisadvantage(expression);
  if (rolled === expression) return { expression, purpose };
  return { expression: rolled, purpose: `${purpose} (${getModeLabels(gameSystem)[mode]})` };
}
