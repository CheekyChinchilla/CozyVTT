/**
 * rules/pathfinder2e.ts
 * Pathfinder 2e derived numbers: proficiency bonus, Armor Class, Class DC,
 * and the attribute a sheet names.
 *
 * ---------------------------------------------------------------------------
 * DUPLICATED FILE — these two copies must stay byte-for-byte identical:
 *   frontend/src/utils/rules/pathfinder2e.ts
 *   backend/src/utils/rules/pathfinder2e.ts
 * ---------------------------------------------------------------------------
 * The same arrangement as the other rules modules, and for the same reason: the
 * backend suite checks the built-in templates against these formulas, so a
 * template can no longer ship a total that does not follow from the components
 * stored beside it. A parity test fails on any difference between the copies.
 *
 * The point of gathering them here is that the editor and the read-only sheet
 * were each doing their own thing: the editor recalculated on open, the view
 * printed whatever total happened to be stored. A character nobody had re-saved
 * therefore showed the stored number, and the built-in Fighter's was wrong.
 *
 * Rules references, Core Rulebook:
 *   "Armor Class = 10 + Dexterity modifier (up to your armor's Dex Cap) +
 *    proficiency bonus + armor's item bonus to AC + other bonuses + penalties"
 *   "Class DC = 10 + proficiency bonus + key ability modifier"
 *   "If your proficiency rank is trained, this bonus is equal to your level + 2,
 *    and higher proficiency ranks further increase the amount you add"
 */

export type ProficiencyRank = 'untrained' | 'trained' | 'expert' | 'master' | 'legendary';

/** What each rank adds on top of the character's level. */
const RANK_INCREMENT: Record<ProficiencyRank, number | null> = {
  // Untrained adds nothing at all — not level, not a bonus. The others are
  // level plus a fixed amount.
  untrained: null,
  trained: 2,
  expert: 4,
  master: 6,
  legendary: 8,
};

/** A number from an unknown value, 0 when it is not one. */
function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** An object from an unknown value, or undefined. */
function rec(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * The proficiency bonus for a rank at a level.
 *
 * Untrained is +0 rather than level + 0: an untrained character adds nothing,
 * which is the difference the rules are explicit about.
 */
export function pf2eProficiencyBonus(level: unknown, rank: unknown): number {
  const increment = RANK_INCREMENT[(rank as ProficiencyRank)] ?? null;
  if (increment === null) return 0;
  return num(level) + increment;
}

/**
 * Armor Class.
 *
 * The Dexterity modifier is capped by the armour's Dex Cap where one is
 * recorded; a null cap means unarmoured or uncapped and the full modifier
 * applies. `armorPenalty` is deliberately not included — in PF2e that is the
 * check penalty, which applies to skill checks and never to AC.
 */
export function pf2eArmorClass(data: unknown): number {
  const sheet = rec(data);
  const ac = rec(sheet?.armorClass);
  if (!ac) return 10;

  const dexMod = num(rec(rec(sheet?.attributes)?.dexterity)?.modifier);
  const capDex = ac.capDex;
  const cappedDex =
    typeof capDex === 'number' && Number.isFinite(capDex) ? Math.min(dexMod, capDex) : dexMod;

  return 10 + cappedDex + pf2eProficiencyBonus(sheet?.level, ac.proficiencyRank) + num(ac.itemBonus);
}

/** The six attributes, as a sheet's `attributes` keys, in sheet order. */
export const PF2E_ATTRIBUTE_NAMES = [
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
] as const;

export type Pf2eAttributeName = (typeof PF2E_ATTRIBUTE_NAMES)[number];

/**
 * The attribute a sheet names, as an `attributes` key, or null.
 *
 * Attributes are stored in full ("strength"), abbreviated ("str") or
 * capitalised ("Str", "STR"), depending on which version of the sheet or which
 * template wrote them. The empty name is refused first because `startsWith('')`
 * is true of every name: a sheet that never recorded one matched whichever came
 * first, which is Strength, and used it without saying so.
 */
export function pf2eAttributeName(value: unknown): Pf2eAttributeName | null {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!key) return null;
  return PF2E_ATTRIBUTE_NAMES.find((name) => name === key || name.startsWith(key)) ?? null;
}

/** Class DC: 10 + proficiency bonus + the class's key attribute modifier. */
export function pf2eClassDC(data: unknown): number {
  const sheet = rec(data);
  const dc = rec(sheet?.classDC);
  if (!dc) return 10;

  const matched = pf2eAttributeName(dc.keyAttribute);
  const attributes = rec(sheet?.attributes) ?? {};
  const attrMod = matched ? num(rec(attributes[matched])?.modifier) : 0;

  return 10 + attrMod + pf2eProficiencyBonus(sheet?.level, dc.proficiencyRank);
}
