/**
 * rules/pathfinder2e.ts
 * Pathfinder 2e derived numbers: proficiency bonus, Armor Class, Class DC,
 * saving throw, Perception and skill totals, spell attack and spell DC, the
 * attribute a sheet names, and Bulk.
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

/**
 * A check penalty as the penalty it is. "A bonus is always positive, and a
 * penalty is always negative" (Core Rulebook, "Bonuses and Penalties"), and
 * armor prints its check penalty as -1 to -3; a sheet may hold it either way.
 */
export function pf2eCheckPenalty(value: unknown): number {
  return 0 - Math.abs(num(value));
}

/**
 * A skill's total: its attribute's modifier, the proficiency bonus for its
 * rank, its item bonus, and its check penalty. `skill` is one entry of a
 * sheet's skills or lore skills; the attribute is read in any of the
 * spellings a sheet uses.
 */
export function pf2eSkillTotal(data: unknown, skill: unknown): number {
  const sheet = rec(data);
  const entry = rec(skill);
  if (!entry) return 0;
  const matched = pf2eAttributeName(entry.attribute);
  const attrMod = matched ? num(rec(rec(sheet?.attributes)?.[matched])?.modifier) : 0;
  return attrMod + pf2eProficiencyBonus(sheet?.level, entry.proficiencyRank) + num(entry.itemBonus) + pf2eCheckPenalty(entry.armorPenalty);
}

/** The attribute each saving throw uses. */
export const PF2E_SAVE_ATTRIBUTES = {
  fortitude: 'constitution',
  reflex: 'dexterity',
  will: 'wisdom',
} as const satisfies Record<string, Pf2eAttributeName>;

/** An attribute's modifier off the sheet, 0 when it is not recorded. */
function attributeModifier(sheet: Record<string, unknown> | undefined, name: Pf2eAttributeName): number {
  return num(rec(rec(sheet?.attributes)?.[name])?.modifier);
}

/**
 * A saving throw: its attribute's modifier (Constitution for Fortitude,
 * Dexterity for Reflex, Wisdom for Will), the proficiency bonus for its rank
 * and its item bonus (Core Rulebook, "Saving Throws").
 */
export function pf2eSaveTotal(data: unknown, save: keyof typeof PF2E_SAVE_ATTRIBUTES): number {
  const sheet = rec(data);
  const entry = rec(rec(sheet?.savingThrows)?.[save]);
  return attributeModifier(sheet, PF2E_SAVE_ATTRIBUTES[save]) + pf2eProficiencyBonus(sheet?.level, entry?.proficiencyRank) + num(entry?.itemBonus);
}

/** Perception: Wisdom, the proficiency bonus for its rank, and its item bonus. */
export function pf2ePerceptionTotal(data: unknown): number {
  const sheet = rec(data);
  const entry = rec(sheet?.perception);
  return attributeModifier(sheet, 'wisdom') + pf2eProficiencyBonus(sheet?.level, entry?.proficiencyRank) + num(entry?.itemBonus);
}

/** The spellcasting proficiency rank, which spell attack rolls and spell DCs share. */
function spellcastingRank(spellcasting: Record<string, unknown> | undefined): unknown {
  return rec(spellcasting?.spellAttackBonus)?.proficiencyRank;
}

/** The spellcasting attribute modifier plus the spellcasting proficiency bonus. */
function spellcastingBase(data: unknown): number {
  const sheet = rec(data);
  const spellcasting = rec(sheet?.spellcasting);
  if (!spellcasting) return 0;
  const matched = pf2eAttributeName(spellcasting.keyAttribute);
  const attrMod = matched ? num(rec(rec(sheet?.attributes)?.[matched])?.modifier) : 0;
  return attrMod + pf2eProficiencyBonus(sheet?.level, spellcastingRank(spellcasting));
}

/**
 * Spell attack: "your spellcasting ability modifier + proficiency bonus +
 * other bonuses + penalties" (Core Rulebook, "Spell Attack Rolls"). The rank
 * is the one recorded on the attack, which the spell DC shares: a class gives
 * one proficiency for "spell attack rolls and spell DCs".
 */
export function pf2eSpellAttack(data: unknown): number {
  const spellcasting = rec(rec(data)?.spellcasting);
  return spellcastingBase(data) + num(rec(spellcasting?.spellAttackBonus)?.itemBonus);
}

/**
 * Spell DC: "10 + your spellcasting ability modifier + proficiency bonus +
 * other bonuses + penalties", with the spellcasting rank and the DC's own item
 * bonus. An item that raises the attack roll does not raise the DC.
 */
export function pf2eSpellDC(data: unknown): number {
  const spellcasting = rec(rec(data)?.spellcasting);
  return 10 + spellcastingBase(data) + num(rec(spellcasting?.spellDC)?.itemBonus);
}

/** Light items that make 1 Bulk. */
export const LIGHT_ITEMS_PER_BULK = 10;

/** Bulk carried: whole Bulk, and light items left over that make less than 1. */
export interface Pf2eBulk {
  bulk: number;
  light: number;
}

/**
 * One item's Bulk, read the ways a sheet stores it: a number, a number typed
 * as text ("2"), "L" in either case, or a number between 0 and 1 (the built-in
 * templates wrote 0.1) for a light item, and "—", "-" or nothing for
 * negligible. Anything else counts as nothing.
 */
export function pf2eItemBulk(value: unknown): Pf2eBulk {
  const text = typeof value === 'string' ? value.trim() : null;
  if (text !== null && text.toLowerCase() === 'l') return { bulk: 0, light: 1 };
  const amount = text !== null ? (text === '' ? NaN : Number(text)) : value;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return { bulk: 0, light: 0 };
  return amount < 1 ? { bulk: 0, light: 1 } : { bulk: amount, light: 0 };
}

/**
 * The Bulk an inventory carries.
 *
 * Core Rulebook, "Bulk": "Ten light items count as 1 Bulk, and you round down
 * fractions (so 9 light items count as 0 Bulk, and 11 light items count as 1
 * Bulk)". An item with no quantity is one item; a quantity of 0 is none.
 */
export function pf2eTotalBulk(inventory: unknown): Pf2eBulk {
  let bulk = 0;
  let light = 0;
  for (const entry of Array.isArray(inventory) ? inventory : []) {
    const item = rec(entry);
    if (!item) continue;
    const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity >= 0 ? item.quantity : 1;
    const each = pf2eItemBulk(item.bulk);
    bulk += each.bulk * quantity;
    light += each.light * quantity;
  }
  return { bulk: bulk + Math.floor(light / LIGHT_ITEMS_PER_BULK), light: light % LIGHT_ITEMS_PER_BULK };
}

/**
 * The Bulk a character can carry, and whether `carried` is past either limit.
 *
 * Core Rulebook: "5 plus your Strength modifier without penalty; if you carry
 * more, you gain the encumbered condition. You can't hold or carry more Bulk
 * than 10 plus your Strength modifier." Light items short of a whole Bulk do
 * not count, so the whole Bulk is what is compared.
 */
export function pf2eBulkLimits(strengthModifier: number, carried = 0): {
  encumbered: number;
  maximum: number;
  isEncumbered: boolean;
  isOverloaded: boolean;
} {
  const encumbered = 5 + num(strengthModifier);
  const maximum = 10 + num(strengthModifier);
  return { encumbered, maximum, isEncumbered: carried > encumbered, isOverloaded: carried > maximum };
}

/** Bulk as a sheet writes it: "—" for none, "3 L", "5", or "5 and 2 L". */
export function formatPf2eBulk({ bulk, light }: Pf2eBulk): string {
  const whole = Number.isInteger(bulk) ? String(bulk) : bulk.toFixed(1);
  if (bulk === 0 && light === 0) return '—';
  if (bulk === 0) return `${light} L`;
  return light === 0 ? whole : `${whole} and ${light} L`;
}
