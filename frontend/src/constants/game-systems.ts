/**
 * Game Systems Constants
 * Display labels, descriptions, and form options for game systems
 */

import { GameSystem } from '../types';

/**
 * Display labels for each game system
 */
export const GAME_SYSTEM_LABELS: Record<GameSystem, string> = {
  [GameSystem.FIFTH_EDITION]: '5E (SRD 5.1)',
  [GameSystem.FANTASY_D20]: 'Fantasy d20 (ORC)',
  [GameSystem.HORROR_D100]: 'Horror d100',
};

/**
 * Short display labels for each game system
 */
export const GAME_SYSTEM_SHORT_LABELS: Record<GameSystem, string> = {
  [GameSystem.FIFTH_EDITION]: '5E',
  [GameSystem.FANTASY_D20]: 'ORC d20',
  [GameSystem.HORROR_D100]: 'd100',
};

/**
 * Descriptions for each game system
 */
/**
 * The tint each system's badge is drawn in, wherever a system is labelled.
 *
 * These use the semantic tokens purely as a set of distinguishable, themed
 * hues: a 5E badge is not "danger", it just needs to look different from a
 * Fantasy d20 one and stay readable on every theme.
 */
export const GAME_SYSTEM_TINTS: Record<GameSystem, { bg: string; text: string; border: string }> = {
  [GameSystem.FIFTH_EDITION]: { bg: 'bg-danger/10', text: 'text-danger-ink', border: 'border-danger/30' },
  [GameSystem.FANTASY_D20]: { bg: 'bg-info/10', text: 'text-info-ink', border: 'border-info/30' },
  [GameSystem.HORROR_D100]: { bg: 'bg-success/10', text: 'text-success-ink', border: 'border-success/30' },
};

export const GAME_SYSTEM_DESCRIPTIONS: Record<GameSystem, string> = {
  [GameSystem.FIFTH_EDITION]:
    'Heroic fantasy with classes, levels and a d20. Compatible with fifth edition.',
  [GameSystem.FANTASY_D20]:
    'Tactical fantasy with three actions a turn, proficiency ranks and four degrees of success.',
  [GameSystem.HORROR_D100]:
    'Investigative horror on percentile dice, with Sanity and Luck.',
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
    value: GameSystem.FIFTH_EDITION,
    label: GAME_SYSTEM_LABELS[GameSystem.FIFTH_EDITION],
    shortLabel: GAME_SYSTEM_SHORT_LABELS[GameSystem.FIFTH_EDITION],
    description: GAME_SYSTEM_DESCRIPTIONS[GameSystem.FIFTH_EDITION],
  },
  {
    value: GameSystem.FANTASY_D20,
    label: GAME_SYSTEM_LABELS[GameSystem.FANTASY_D20],
    shortLabel: GAME_SYSTEM_SHORT_LABELS[GameSystem.FANTASY_D20],
    description: GAME_SYSTEM_DESCRIPTIONS[GameSystem.FANTASY_D20],
  },
  {
    value: GameSystem.HORROR_D100,
    label: GAME_SYSTEM_LABELS[GameSystem.HORROR_D100],
    shortLabel: GAME_SYSTEM_SHORT_LABELS[GameSystem.HORROR_D100],
    description: GAME_SYSTEM_DESCRIPTIONS[GameSystem.HORROR_D100],
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
 * Whether `code` names a game system this build knows. A character or
 * campaign stored with the value of a system CozyVTT no longer supports
 * names one it does not, as can a file made on another instance.
 */
export function isGameSystem(code: unknown): code is GameSystem {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(GAME_SYSTEM_LABELS, code);
}

/**
 * Whether a character, template or campaign has a game system this build
 * knows, or none: what can be edited, used or published as a template. The
 * value of a system CozyVTT no longer supports is neither, and its sheet is
 * shown read-only.
 */
export function isSupportedOrNoSystem(code: unknown): boolean {
  return !code || isGameSystem(code);
}

/** What a character, template or campaign with no game system is called. */
export const FLEXIBLE_SYSTEM_LABEL = 'Flexible';

/** What a game system code this build does not know is called, wherever a system is named. */
export const UNSUPPORTED_SYSTEM_LABEL = 'Unsupported system';

/** The line over the sheet of a character whose game system this build does not know. */
export const UNSUPPORTED_SYSTEM_NOTICE =
  'This character was made for a game system CozyVTT no longer supports. Its data is kept; you can export or delete it.';

/** The same line over a template's sheet: a template has no Export. */
export const UNSUPPORTED_SYSTEM_TEMPLATE_NOTICE =
  'This template was made for a game system CozyVTT no longer supports. Its data is kept; you can delete it.';

/**
 * The name to show for a character's or campaign's game system: its label,
 * Flexible for none, and Unsupported system for a code this build does not know.
 */
export function gameSystemName(gameSystem: GameSystem | string | null | undefined): string {
  if (!gameSystem) return FLEXIBLE_SYSTEM_LABEL;
  return isGameSystem(gameSystem) ? GAME_SYSTEM_LABELS[gameSystem] : UNSUPPORTED_SYSTEM_LABEL;
}

/**
 * A campaign's game system as the app plays it: none for a code this build
 * does not know, so such a campaign's creature library, rolls and initiative
 * are those of a campaign with no system.
 */
export function playedGameSystem(gameSystem: GameSystem | string | null | undefined): GameSystem | null {
  return isGameSystem(gameSystem) ? gameSystem : null;
}
