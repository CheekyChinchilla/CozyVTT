import type { DnD5eHitDice } from '@/types/game-systems/dnd5e';

/**
 * D&D 5e hit dice.
 *
 * A hit dice entry stores the *pool* — `total: "5d8"` means five d8 hit dice —
 * alongside `remaining`, how many of them are unspent. Spending one is a single
 * die plus Constitution, never the pool, so the stored string cannot be rolled
 * as it stands: "5d8" would roll all five at once.
 *
 * Basic Rules, Short Rest: "For each Hit Die spent in this way, the player
 * rolls the die and adds the character's Constitution modifier to it. The
 * character regains hit points equal to the total (minimum of 0)."
 */

/**
 * The size of a single die in a hit dice pool, or null if the stored total
 * does not describe one.
 *
 * `total` is `z.string()` with no format constraint, so it holds whatever was
 * typed — including nothing. Reading it has already crashed a sheet once, so
 * this refuses rather than guesses: no die, no roll offered.
 */
export function hitDieSize(total: string): number | null {
  if (typeof total !== 'string') return null;
  const match = /^\s*\d*\s*d\s*(\d+)\s*$/i.exec(total);
  if (!match) return null;
  const size = Number(match[1]);
  return Number.isInteger(size) && size > 0 ? size : null;
}

/** The expression for spending one hit die: the die itself plus Constitution. */
export function hitDieRoll(dieSize: number, conModifier: number): string {
  return `1d${dieSize}${conModifier >= 0 ? '+' : ''}${conModifier}`;
}

/** Whether this entry can be spent: it describes a die, and one is left. */
export function canSpendHitDie(hd: DnD5eHitDice): boolean {
  return hitDieSize(hd.total) !== null && (hd.remaining ?? 0) > 0;
}
