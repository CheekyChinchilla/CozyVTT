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

/**
 * The fifteen conditions of D&D 5e, in the order the rules list them.
 *
 * This is the only place the set is written down. It used to be declared twice
 * — the character sheet offered all fifteen, the token editor a hand-picked
 * twelve — and the two drifted: a DM could not mark an NPC Deafened, Grappled
 * or Petrified, though a player character could be. Grappled in particular is
 * one of the most frequently applied conditions in play.
 *
 * Both editors import this list, so the two cannot disagree again. Anything
 * added here needs an entry in CONDITION_ABBREVIATIONS below; a test checks the
 * two match exactly, in both directions.
 *
 * Rules reference: the Basic Rules, Appendix A "Conditions".
 */
export const DND5E_CONDITIONS: readonly string[] = [
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
 * Two-letter codes, one per 5e condition. Every value here is unique; a test
 * enforces that, since a collision would quietly bring back the original bug.
 */
export const CONDITION_ABBREVIATIONS: Readonly<Record<string, string>> = {
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
};

/**
 * The badge text for a condition.
 *
 * Falls back to the first two letters for anything not in the table — homebrew
 * conditions and whatever a future rules module adds — so an unrecognised name
 * still shows something meaningful rather than being dropped.
 */
export function conditionAbbreviation(condition: string): string {
  if (!condition) return '?';
  const known = CONDITION_ABBREVIATIONS[condition.trim().toLowerCase()];
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
