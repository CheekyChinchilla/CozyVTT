/**
 * Game Systems Constants
 * Display labels, descriptions, and form options for game systems
 */

import { GameSystem } from '../types';

/**
 * Display labels for each game system
 */
export const GAME_SYSTEM_LABELS: Record<GameSystem, string> = {
  [GameSystem.DND_5E]: 'Dungeons & Dragons 5th Edition',
  [GameSystem.PATHFINDER_2E]: 'Pathfinder 2nd Edition',
  [GameSystem.SHADOWRUN_6E]: 'Shadowrun 6th Edition',
  [GameSystem.CALL_OF_CTHULHU_7E]: 'Call of Cthulhu 7th Edition',
};

/**
 * Short display labels for each game system
 */
export const GAME_SYSTEM_SHORT_LABELS: Record<GameSystem, string> = {
  [GameSystem.DND_5E]: 'D&D 5e',
  [GameSystem.PATHFINDER_2E]: 'PF2e',
  [GameSystem.SHADOWRUN_6E]: 'SR6',
  [GameSystem.CALL_OF_CTHULHU_7E]: 'CoC 7e',
};

/**
 * Descriptions for each game system
 */
export const GAME_SYSTEM_DESCRIPTIONS: Record<GameSystem, string> = {
  [GameSystem.DND_5E]:
    'The world\'s most popular tabletop RPG. High fantasy adventures with heroic characters.',
  [GameSystem.PATHFINDER_2E]:
    'A deep and customizable fantasy RPG with tactical combat and character building.',
  [GameSystem.SHADOWRUN_6E]:
    'Cyberpunk meets fantasy in a dystopian future with magic, technology, and corporate intrigue.',
  [GameSystem.CALL_OF_CTHULHU_7E]:
    'Investigate cosmic horror in the style of H.P. Lovecraft. Sanity-testing mystery and dread.',
};

/**
 * Options array for form selects
 */
export interface GameSystemOption {
  value: GameSystem;
  label: string;
  shortLabel: string;
  description: string;
}

export const GAME_SYSTEM_OPTIONS: GameSystemOption[] = [
  {
    value: GameSystem.DND_5E,
    label: GAME_SYSTEM_LABELS[GameSystem.DND_5E],
    shortLabel: GAME_SYSTEM_SHORT_LABELS[GameSystem.DND_5E],
    description: GAME_SYSTEM_DESCRIPTIONS[GameSystem.DND_5E],
  },
  {
    value: GameSystem.PATHFINDER_2E,
    label: GAME_SYSTEM_LABELS[GameSystem.PATHFINDER_2E],
    shortLabel: GAME_SYSTEM_SHORT_LABELS[GameSystem.PATHFINDER_2E],
    description: GAME_SYSTEM_DESCRIPTIONS[GameSystem.PATHFINDER_2E],
  },
  // Shadowrun 6e - Temporarily disabled until further notice
  // {
  //   value: GameSystem.SHADOWRUN_6E,
  //   label: GAME_SYSTEM_LABELS[GameSystem.SHADOWRUN_6E],
  //   shortLabel: GAME_SYSTEM_SHORT_LABELS[GameSystem.SHADOWRUN_6E],
  //   description: GAME_SYSTEM_DESCRIPTIONS[GameSystem.SHADOWRUN_6E],
  // },
  {
    value: GameSystem.CALL_OF_CTHULHU_7E,
    label: GAME_SYSTEM_LABELS[GameSystem.CALL_OF_CTHULHU_7E],
    shortLabel: GAME_SYSTEM_SHORT_LABELS[GameSystem.CALL_OF_CTHULHU_7E],
    description: GAME_SYSTEM_DESCRIPTIONS[GameSystem.CALL_OF_CTHULHU_7E],
  },
];

/**
 * Get display label for a game system
 * @param gameSystem - The game system enum value
 * @param useShort - Whether to use short label (default: false)
 * @returns The display label
 */
export function getGameSystemLabel(
  gameSystem: GameSystem | null,
  useShort: boolean = false
): string {
  if (!gameSystem) {
    return 'No System Selected';
  }
  return useShort
    ? GAME_SYSTEM_SHORT_LABELS[gameSystem]
    : GAME_SYSTEM_LABELS[gameSystem];
}

/**
 * Get description for a game system
 * @param gameSystem - The game system enum value
 * @returns The description
 */
export function getGameSystemDescription(gameSystem: GameSystem | null): string {
  if (!gameSystem) {
    return 'Select a game system for this campaign or character.';
  }
  return GAME_SYSTEM_DESCRIPTIONS[gameSystem];
}
