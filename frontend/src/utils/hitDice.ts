import type { FifthEditionHitDice } from '@/types/game-systems/fifthEdition';
import { isValidDiceExpression } from './diceExpression';

/**
 * 5E hit dice.
 *
 * A pool is "how many" and "of what": `maximum: 5` with `die: "d10"` is five
 * d10 hit dice, and `remaining` is how many are unspent. Spending one rolls a
 * single die plus Constitution.
 *
 * SRD 5.1, "Short Rest": "For each Hit Die spent in this way, the player
 * rolls the die and adds the character's Constitution modifier to it. The
 * character regains hit points equal to the total."
 *
 * `total` is the older field, which packed both into one string ("5d10"). It is
 * still read so sheets written before `die`/`maximum` keep working, but nothing
 * writes it any more, and `die` wins wherever both are present. Neither field
 * ever changes meaning depending on the other.
 */

/**
 * The size of a single die in an older pool string, or null if it does not
 * describe one. `total` has no format constraint in the schema, and a sheet has
 * already crashed reading an empty one, so this refuses rather than guesses.
 *
 * Spaces at either end are trimmed before matching. Matched inside the
 * pattern, next to an optional count, a long run of them took minutes to
 * refuse, and anyone who can edit a sheet can store one for everyone who
 * opens it.
 */
export function hitDieSize(total: string): number | null {
  if (typeof total !== 'string') return null;
  const match = /^(?:\d+\s*)?d\s*(\d+)$/i.exec(total.trim());
  if (!match) return null;
  const size = Number(match[1]);
  return Number.isInteger(size) && size > 0 ? size : null;
}

/**
 * How many dice an older pool string records, or null if it does not say.
 *
 * A bare "d10" is someone writing only the die, not a pool of exactly one — a
 * sheet holding "d10" with five remaining is a real case. Reporting one there
 * would print a maximum smaller than what the character actually has.
 */
function poolCount(total: string): number | null {
  if (typeof total !== 'string') return null;
  const match = /^\s*(\d+)\s*d\s*\d+\s*$/i.exec(total);
  return match ? Number(match[1]) : null;
}

/**
 * The roll for one hit die, or null if the sheet does not describe one.
 *
 * `die` holds it directly and may be anything the dice parser accepts — "d10",
 * but equally "2d6" or "1d10+1" for a homebrew pool. Without it, one die is
 * taken out of the older pool string. The parser is asked about the die on
 * its own and with Constitution added, as it is spent: a die that ends in a
 * sign rolls only once the modifier follows it, and then not as die plus
 * Constitution ("d10/+2" halves the die). One + at the end is dropped, since
 * "1d10+" did roll as the die plus Constitution and still does.
 */
export function hitDieExpression(hd: FifthEditionHitDice, conModifier: number): string | null {
  const written = typeof hd.die === 'string' ? hd.die.trim() : '';
  const size = written ? null : hitDieSize(hd.total ?? '');
  const expression = written ? written.replace(/\+$/, '').trimEnd() : size === null ? null : `1d${size}`;
  if (expression === null) return null;
  return isValidDiceExpression(expression) && isValidDiceExpression(spendRoll(expression, conModifier)) ? expression : null;
}

/**
 * How many dice the pool holds at full, or null if nothing trustworthy records
 * it.
 *
 * A maximum below what is left contradicts itself — older sheets can hold that,
 * because nothing ever stopped `total` and `remaining` disagreeing. Rather than
 * print "5/1", say nothing and let the caller fall back to a plain count.
 */
export function hitDiceMaximum(hd: FifthEditionHitDice): number | null {
  const recorded =
    typeof hd.maximum === 'number' && Number.isInteger(hd.maximum) && hd.maximum >= 0
      ? hd.maximum
      : poolCount(hd.total ?? '');
  if (recorded === null) return null;
  return recorded < (hd.remaining ?? 0) ? null : recorded;
}

/** Spending a hit die: the die itself, plus Constitution. */
export function spendRoll(expression: string, conModifier: number): string {
  return `${expression}${conModifier >= 0 ? '+' : ''}${conModifier}`;
}

/** Whether this entry can be spent: it describes a die, and one is left. */
export function canSpendHitDie(hd: FifthEditionHitDice, conModifier: number): boolean {
  return hitDieExpression(hd, conModifier) !== null && (hd.remaining ?? 0) > 0;
}
