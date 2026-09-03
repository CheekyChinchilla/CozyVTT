/**
 * rules/pathfinder2e.ts
 * Pathfinder 2e derived numbers: proficiency bonus, Armor Class, Class DC.
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

/** Class DC: 10 + proficiency bonus + the class's key attribute modifier. */
export function pf2eClassDC(data: unknown): number {
  const sheet = rec(data);
  const dc = rec(sheet?.classDC);
  if (!dc) return 10;

  // The key attribute is stored either in full ("strength") or abbreviated
  // ("str"), depending on which version of the sheet wrote it.
  const key = typeof dc.keyAttribute === 'string' ? dc.keyAttribute.trim().toLowerCase() : '';
  const attributes = rec(sheet?.attributes) ?? {};
  // The empty key is checked first because `startsWith('')` is true of every
  // name: a sheet that never recorded a key attribute matched whichever one
  // came first, which is Strength on everything the app writes, and used it
  // without saying so.
  const matched = key
    ? Object.keys(attributes).find((name) => name === key || name.startsWith(key))
    : undefined;
  const attrMod = matched ? num(rec(attributes[matched])?.modifier) : 0;

  return 10 + attrMod + pf2eProficiencyBonus(sheet?.level, dc.proficiencyRank);
}
