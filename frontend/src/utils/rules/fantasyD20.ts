// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * rules/fantasyD20.ts
 * Fantasy d20 derived numbers: proficiency bonus, Armor Class, Class DC,
 * saving throw, Perception and skill totals, spell attack and spell DC, the
 * attribute a sheet names, and Bulk.
 *
 * ---------------------------------------------------------------------------
 * DUPLICATED FILE — these two copies must stay byte-for-byte identical:
 *   frontend/src/utils/rules/fantasyD20.ts
 *   backend/src/utils/rules/fantasyD20.ts
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
 * The rules, in short:
 *   Armor Class is 10, plus the Dexterity modifier up to the armour's Dex Cap,
 *   the proficiency bonus, the armour's item bonus, and any other bonuses and
 *   penalties.
 *   Class DC is 10, plus the proficiency bonus and the key attribute's modifier.
 *   The proficiency bonus is the character's level plus 2 when trained, and
 *   more for each rank above that; untrained adds nothing.
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
export function fantasyD20ProficiencyBonus(level: unknown, rank: unknown): number {
  const increment = RANK_INCREMENT[(rank as ProficiencyRank)] ?? null;
  if (increment === null) return 0;
  return num(level) + increment;
}

/**
 * Maximum hit points: the ancestry's hit points, then the class's hit points
 * plus the Constitution modifier at every level. At least 1, the least a sheet
 * stores; only boxes typed as 0 come lower, as an ancestry and a class each
 * give 6 or more.
 */
export function fantasyD20MaxHitPoints(ancestryHp: unknown, classHpPerLevel: unknown, level: unknown, constitutionModifier: unknown): number {
  return Math.max(1, num(ancestryHp) + (num(classHpPerLevel) + num(constitutionModifier)) * num(level));
}

/**
 * Armor Class.
 *
 * The Dexterity modifier is capped by the armour's Dex Cap where one is
 * recorded; a null cap means unarmoured or uncapped and the full modifier
 * applies. `armorPenalty` is deliberately not included — in Fantasy d20 that is the
 * check penalty, which applies to skill checks and never to AC.
 */
export function fantasyD20ArmorClass(data: unknown): number {
  const sheet = rec(data);
  const ac = rec(sheet?.armorClass);
  if (!ac) return 10;

  const dexMod = num(rec(rec(sheet?.attributes)?.dexterity)?.modifier);
  const capDex = ac.capDex;
  const cappedDex =
    typeof capDex === 'number' && Number.isFinite(capDex) ? Math.min(dexMod, capDex) : dexMod;

  return 10 + cappedDex + fantasyD20ProficiencyBonus(sheet?.level, ac.proficiencyRank) + num(ac.itemBonus);
}

/** The six attributes, as a sheet's `attributes` keys, in sheet order. */
export const FANTASY_D20_ATTRIBUTE_NAMES = [
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
] as const;

export type FantasyD20AttributeName = (typeof FANTASY_D20_ATTRIBUTE_NAMES)[number];

/**
 * The attribute a sheet names, as an `attributes` key, or null.
 *
 * Attributes are stored in full ("strength"), abbreviated ("str") or
 * capitalised ("Str", "STR"), depending on which version of the sheet or which
 * template wrote them. The empty name is refused first because `startsWith('')`
 * is true of every name: a sheet that never recorded one matched whichever came
 * first, which is Strength, and used it without saying so.
 */
export function fantasyD20AttributeName(value: unknown): FantasyD20AttributeName | null {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!key) return null;
  return FANTASY_D20_ATTRIBUTE_NAMES.find((name) => name === key || name.startsWith(key)) ?? null;
}

/** Class DC: 10 + proficiency bonus + the class's key attribute modifier. */
export function fantasyD20ClassDC(data: unknown): number {
  const sheet = rec(data);
  const dc = rec(sheet?.classDC);
  if (!dc) return 10;

  const matched = fantasyD20AttributeName(dc.keyAttribute);
  const attributes = rec(sheet?.attributes) ?? {};
  const attrMod = matched ? num(rec(attributes[matched])?.modifier) : 0;

  return 10 + attrMod + fantasyD20ProficiencyBonus(sheet?.level, dc.proficiencyRank);
}

/**
 * A check penalty as the penalty it is. In the rules a penalty always lowers
 * a total, and armor prints its check penalty as -1 to -3; a sheet may hold it
 * either way.
 */
export function fantasyD20CheckPenalty(value: unknown): number {
  return 0 - Math.abs(num(value));
}

/**
 * A skill's total: its attribute's modifier, the proficiency bonus for its
 * rank, its item bonus, and its check penalty. `skill` is one entry of a
 * sheet's skills or lore skills; the attribute is read in any of the
 * spellings a sheet uses.
 */
export function fantasyD20SkillTotal(data: unknown, skill: unknown): number {
  const sheet = rec(data);
  const entry = rec(skill);
  if (!entry) return 0;
  const matched = fantasyD20AttributeName(entry.attribute);
  const attrMod = matched ? num(rec(rec(sheet?.attributes)?.[matched])?.modifier) : 0;
  return attrMod + fantasyD20ProficiencyBonus(sheet?.level, entry.proficiencyRank) + num(entry.itemBonus) + fantasyD20CheckPenalty(entry.armorPenalty);
}

/** The attribute each saving throw uses. */
export const FANTASY_D20_SAVE_ATTRIBUTES = {
  fortitude: 'constitution',
  reflex: 'dexterity',
  will: 'wisdom',
} as const satisfies Record<string, FantasyD20AttributeName>;

/** An attribute's modifier off the sheet, 0 when it is not recorded. */
function attributeModifier(sheet: Record<string, unknown> | undefined, name: FantasyD20AttributeName): number {
  return num(rec(rec(sheet?.attributes)?.[name])?.modifier);
}

/**
 * A saving throw: its attribute's modifier (Constitution for Fortitude,
 * Dexterity for Reflex, Wisdom for Will), the proficiency bonus for its rank
 * and its item bonus.
 */
export function fantasyD20SaveTotal(data: unknown, save: keyof typeof FANTASY_D20_SAVE_ATTRIBUTES): number {
  const sheet = rec(data);
  const entry = rec(rec(sheet?.savingThrows)?.[save]);
  return attributeModifier(sheet, FANTASY_D20_SAVE_ATTRIBUTES[save]) + fantasyD20ProficiencyBonus(sheet?.level, entry?.proficiencyRank) + num(entry?.itemBonus);
}

/** Perception: Wisdom, the proficiency bonus for its rank, and its item bonus. */
export function fantasyD20PerceptionTotal(data: unknown): number {
  const sheet = rec(data);
  const entry = rec(sheet?.perception);
  return attributeModifier(sheet, 'wisdom') + fantasyD20ProficiencyBonus(sheet?.level, entry?.proficiencyRank) + num(entry?.itemBonus);
}

/**
 * The spellcasting proficiency rank, which spell attack rolls and spell DCs
 * share: the one recorded on the attack, or on the DC for a sheet that
 * records no attack.
 */
function spellcastingRank(spellcasting: Record<string, unknown> | undefined): unknown {
  return rec(spellcasting?.spellAttackBonus)?.proficiencyRank ?? rec(spellcasting?.spellDC)?.proficiencyRank;
}

/** The spellcasting attribute modifier plus the spellcasting proficiency bonus. */
function spellcastingBase(data: unknown): number {
  const sheet = rec(data);
  const spellcasting = rec(sheet?.spellcasting);
  if (!spellcasting) return 0;
  const matched = fantasyD20AttributeName(spellcasting.keyAttribute);
  const attrMod = matched ? num(rec(rec(sheet?.attributes)?.[matched])?.modifier) : 0;
  return attrMod + fantasyD20ProficiencyBonus(sheet?.level, spellcastingRank(spellcasting));
}

/**
 * Spell attack: the spellcasting attribute's modifier, the proficiency bonus,
 * and any other bonuses and penalties. The rank is the one recorded on the
 * attack, which the spell DC shares: a class gives one proficiency for both.
 */
export function fantasyD20SpellAttack(data: unknown): number {
  const spellcasting = rec(rec(data)?.spellcasting);
  return spellcastingBase(data) + num(rec(spellcasting?.spellAttackBonus)?.itemBonus);
}

/**
 * Spell DC: 10, plus the spellcasting attribute's modifier, the proficiency
 * bonus, and any other bonuses and penalties, with the spellcasting rank and
 * the DC's own item bonus. An item that raises the attack roll does not raise
 * the DC.
 */
export function fantasyD20SpellDC(data: unknown): number {
  const spellcasting = rec(rec(data)?.spellcasting);
  return 10 + spellcastingBase(data) + num(rec(spellcasting?.spellDC)?.itemBonus);
}

/** Light items that make 1 Bulk. */
export const LIGHT_ITEMS_PER_BULK = 10;

/** Coins, of any denomination, that make 1 Bulk. */
export const COINS_PER_BULK = 1000;

/** Bulk carried: whole Bulk, and light items left over that make less than 1. */
export interface FantasyD20Bulk {
  bulk: number;
  light: number;
}

/**
 * One item's Bulk, read the ways a sheet stores it: a number, a number typed
 * as text ("2"), "L" in either case, or a number between 0 and 1 (the built-in
 * templates wrote 0.1) for a light item, and "—", "-" or nothing for
 * negligible. Anything else counts as nothing.
 */
export function fantasyD20ItemBulk(value: unknown): FantasyD20Bulk {
  const text = typeof value === 'string' ? value.trim() : null;
  if (text !== null && text.toLowerCase() === 'l') return { bulk: 0, light: 1 };
  const amount = text !== null ? (text === '' ? NaN : Number(text)) : value;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return { bulk: 0, light: 0 };
  return amount < 1 ? { bulk: 0, light: 1 } : { bulk: amount, light: 0 };
}

/**
 * The Bulk an inventory carries.
 *
 * In the rules every ten light items make 1 Bulk and a remainder is dropped,
 * so 9 light items are no Bulk and 11 are 1. An item with no quantity is one
 * item; a quantity of 0 is none. Coins count too: every 1,000 coins, of any
 * kinds together, make 1 Bulk, and a remainder is dropped.
 */
export function fantasyD20TotalBulk(inventory: unknown, currency?: unknown): FantasyD20Bulk {
  let bulk = 0;
  let light = 0;
  for (const entry of Array.isArray(inventory) ? inventory : []) {
    const item = rec(entry);
    if (!item) continue;
    const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity >= 0 ? item.quantity : 1;
    const each = fantasyD20ItemBulk(item.bulk);
    bulk += each.bulk * quantity;
    light += each.light * quantity;
  }
  const purse = rec(currency);
  const coins = purse ? ['cp', 'sp', 'gp', 'pp'].reduce((sum, coin) => sum + Math.max(0, num(purse[coin])), 0) : 0;
  return {
    bulk: bulk + Math.floor(light / LIGHT_ITEMS_PER_BULK) + Math.floor(coins / COINS_PER_BULK),
    light: light % LIGHT_ITEMS_PER_BULK,
  };
}

/**
 * The Bulk a character can carry, and whether `carried` is past either limit.
 *
 * In the rules a character carries up to 5 plus their Strength modifier in
 * Bulk freely, is encumbered above that, and cannot carry more than 10 plus
 * their Strength modifier. Light items short of a whole Bulk do not count, so
 * the whole Bulk is what is compared.
 */
export function fantasyD20BulkLimits(strengthModifier: number, carried = 0): {
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
export function formatFantasyD20Bulk({ bulk, light }: FantasyD20Bulk): string {
  const whole = Number.isInteger(bulk) ? String(bulk) : bulk.toFixed(1);
  if (bulk === 0 && light === 0) return '—';
  if (bulk === 0) return `${light} L`;
  return light === 0 ? whole : `${whole} and ${light} L`;
}
