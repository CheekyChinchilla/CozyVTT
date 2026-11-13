// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * Condition abbreviations for token badges.
 *
 * The map used to draw the first letter of each condition in a small dot, which
 * cannot distinguish the ones that matter most in play: Paralyzed, Poisoned,
 * Petrified and Prone all render "P", and Incapacitated and Invisible both
 * render "I". A player looking at a token could tell that *something* was wrong
 * with it and nothing more.
 *
 * Two letters is enough to separate every condition in the game from every
 * other, which is why the pairs below are chosen rather than simply taking the
 * first two characters — "In" would collide for Incapacitated and Invisible, and
 * "Pa"/"Pe"/"Po"/"Pr" are easy to misread at a glance. The badge is still only a
 * reminder: hovering a token names its conditions in full.
 */

import { GameSystem } from '@/types/gameSystem';
import type { HorrorD100SheetConditions } from '@/types/game-systems/horrorD100Sheet';

/**
 * The fifteen conditions of 5E, in the order the rules list them.
 *
 * This is the only place the set is written down. It used to be declared twice
 * — the character sheet offered all fifteen, the token editor a hand-picked
 * twelve — and the two drifted: a GM could not mark an NPC Deafened, Grappled
 * or Petrified, though a player character could be. Grappled in particular is
 * one of the most frequently applied conditions in play.
 *
 * Both editors import this list, so the two cannot disagree again. Anything
 * added here needs an entry in CONDITION_ABBREVIATIONS below; a test checks the
 * two match exactly, in both directions.
 *
 * Rules reference: SRD 5.1, "Appendix PH-A: Conditions".
 */
export const FIFTH_EDITION_CONDITIONS: readonly string[] = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Exhausted',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
];

/**
 * Effects a 5E table marks on a token beside its conditions: the state a
 * spell, a class feature or an action leaves a creature in, named as the
 * creature is (Blessed, from the Bless spell). None is a condition in the rules,
 * so they are a list of their own and FIFTH_EDITION_CONDITIONS stays the rules'
 * fifteen. The token editor offers them in a group under the conditions, and
 * a token carries them in its conditions as it carries a typed one. Each
 * needs an entry in CONDITION_ABBREVIATIONS below, as a condition does.
 *
 * Rules reference: the spells Bane, Bless, Haste, Hunter's Mark and Slow;
 * the Barbarian's Rage; the Dodge action; concentration on a spell (all SRD
 * 5.1). The list follows the SRD 5.1: a token carrying any other effect,
 * such as one offered before 1.7.0, shows it as a typed one.
 */
export const FIFTH_EDITION_EFFECTS: readonly string[] = [
  'Baned',
  'Blessed',
  'Concentrating',
  'Dodging',
  'Hasted',
  "Hunter's Mark",
  'Raging',
  'Slowed',
];

/**
 * The four conditions a Horror d100 sheet tracks: the three that follow
 * from hit points (open d100 rules, p. 14, Hit Points and Major Wounds),
 * then the one from Sanity (p. 259, Sanity Mechanics). Major Wound,
 * Unconscious and Temporary Insanity are the rules' terms. Dying is
 * CozyVTT's label for a character at 0 hit points, who by that page dies at
 * the end of the following round; the rules name no such condition. The character sheet
 * ticks them by `key`; the token editor offers them by `label`. A token
 * carrying a condition offered before 1.7.0 and not listed here shows it as
 * a typed one.
 */
export const HORROR_D100_CONDITIONS: readonly { key: keyof HorrorD100SheetConditions; label: string }[] = [
  { key: 'majorWound', label: 'Major Wound' },
  { key: 'dying', label: 'Dying' },
  { key: 'unconscious', label: 'Unconscious' },
  { key: 'temporaryInsanity', label: 'Temporary Insanity' },
];

/**
 * The conditions the token editor lists for a campaign's game system. Only
 * 5E and Horror d100 have a list here; in every system the GM can
 * also type a condition of their own.
 */
export function conditionsOffered(gameSystem: GameSystem | null): readonly string[] {
  switch (gameSystem) {
    case GameSystem.FIFTH_EDITION:
      return FIFTH_EDITION_CONDITIONS;
    case GameSystem.HORROR_D100:
      return HORROR_D100_CONDITIONS.map((condition) => condition.label);
    default:
      return [];
  }
}

/**
 * The effects the token editor lists, under the conditions, for a campaign's
 * game system: 5E's, and none in any other.
 */
export function effectsOffered(gameSystem: GameSystem | null): readonly string[] {
  return gameSystem === GameSystem.FIFTH_EDITION ? FIFTH_EDITION_EFFECTS : [];
}

/**
 * Two-letter codes, one per listed condition and effect (5E and Horror
 * d100, which share Unconscious). Every value here is unique; a test
 * enforces that, since a collision would quietly bring back the original bug.
 *
 * A Map, so a name finds only an entry of its own: a condition typed as
 * "constructor" found Object itself in a plain object's lookup, and the badge
 * drew a function's text.
 */
export const CONDITION_ABBREVIATIONS: ReadonlyMap<string, string> = new Map(Object.entries({
  blinded: 'BL',
  charmed: 'CH',
  deafened: 'DF',
  exhausted: 'EX',
  frightened: 'FR',
  grappled: 'GR',
  incapacitated: 'IN',
  invisible: 'IV',
  paralyzed: 'PA',
  petrified: 'PE',
  poisoned: 'PO',
  prone: 'PR',
  restrained: 'RE',
  stunned: 'ST',
  unconscious: 'UN',
  'major wound': 'MW',
  dying: 'DY',
  'temporary insanity': 'TI',
  baned: 'BA',
  blessed: 'BS',
  concentrating: 'CO',
  dodging: 'DO',
  hasted: 'HA',
  "hunter's mark": 'HM',
  raging: 'RG',
  slowed: 'SL',
}));

/**
 * The name a condition or an effect is known by, however it was typed or
 * stored: trimmed, in lower case, with a curly or a modifier-letter
 * apostrophe (’ ‘ ʼ, as iOS and iPadOS type one) made straight. The badge
 * table is keyed by it, and the token editor matches a typed or stored name
 * to its listed spelling with it, so "Hunter’s Mark" and "hunter's mark" are
 * the listed Hunter's Mark.
 */
export function conditionKey(name: string): string {
  return name.trim().toLowerCase().replace(/[\u2018\u2019\u02BC]/g, "'");
}

/**
 * The badge text for a condition.
 *
 * Falls back to the first two letters for anything not in the table — homebrew
 * conditions and whatever a future rules module adds — so an unrecognised name
 * still shows something meaningful rather than being dropped.
 */
export function conditionAbbreviation(condition: string): string {
  if (!condition) return '?';
  const known = CONDITION_ABBREVIATIONS.get(conditionKey(condition));
  if (known) return known;
  return condition.trim().slice(0, 2).toUpperCase();
}

/**
 * How many badges to draw before collapsing the rest into a "+N" pill.
 *
 * A badge wide enough to read is wider than a fifteenth of a grid square, so a
 * row of them does overhang the token — four plus an overflow marker spans
 * roughly two squares. The cap is there to bound that overhang rather than
 * eliminate it: without one, a creature carrying eight conditions would trail a
 * banner across half the battlefield and hide whatever stands beside it.
 * Legibility is the point of the badges, so the trade is made in its favour and
 * the full list lives in the hover panel.
 */
export const MAX_CONDITION_BADGES = 4;
