// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * fantasyD20StatBlock.ts
 * Fantasy d20 creature stat block helpers.
 *
 * Fantasy d20 works fundamentally differently from 5E, and the previous code
 * applied 5E's model to it wholesale. The differences that matter here:
 *
 *  - Stat blocks print **attribute modifiers** ("Str +4"), not scores. There is
 *    no score behind them, so deriving one is an invention.
 *  - Creatures have a **Level**, not a Challenge Rating.
 *  - There are **three saves** — Fortitude, Reflex, Will — not six ability saves.
 *  - Only **trained-or-better** skills appear; an unlisted skill is untrained.
 *  - Modifiers are **not derived**. The game's creature guidance builds
 *    creatures from benchmarks by level, not from level, proficiency rank and
 *    attribute, so the printed number is the rule. Nothing in this module
 *    computes a bonus.
 *
 * Checked against the rules for reading and building creatures, not written
 * from memory.
 */

import type { NpcStatBlock } from '@/types';
import { ABILITY_KEYS, abilityModifier, formatModifier, type AbilityKey } from '@/utils/rules/fifthEdition';

/** The three Fantasy d20 saving throws, in the order stat blocks print them. */
export const FANTASY_D20_SAVES = [
  { key: 'fortitude', label: 'Fortitude', short: 'Fort' },
  { key: 'reflex', label: 'Reflex', short: 'Ref' },
  { key: 'will', label: 'Will', short: 'Will' },
] as const;

/** The sixteen core Fantasy d20 skills. Lore skills are added freely as custom keys. */
export const FANTASY_D20_SKILLS = [
  'Acrobatics',
  'Arcana',
  'Athletics',
  'Crafting',
  'Deception',
  'Diplomacy',
  'Intimidation',
  'Medicine',
  'Nature',
  'Occultism',
  'Performance',
  'Religion',
  'Society',
  'Stealth',
  'Survival',
  'Thievery',
] as const;

/** Attribute labels as Fantasy d20 abbreviates them. */
export const FANTASY_D20_ATTRIBUTE_LABELS: Record<AbilityKey, string> = {
  str: 'Str',
  dex: 'Dex',
  con: 'Con',
  int: 'Int',
  wis: 'Wis',
  cha: 'Cha',
};

/**
 * Read a creature's attribute modifiers.
 *
 * Prefers the explicit modifiers a Fantasy d20 stat block carries. Falls back to
 * deriving from `abilities` for creatures entered before that field existed, so
 * switching a campaign to Fantasy d20 shows sensible values rather than zeroes.
 */
export function readAttributeModifiers(statBlock: NpcStatBlock): Record<AbilityKey, number> {
  const explicit = statBlock.attributeModifiers;
  const result = {} as Record<AbilityKey, number>;

  for (const key of ABILITY_KEYS) {
    if (explicit && typeof explicit[key] === 'number') {
      result[key] = explicit[key];
    } else {
      result[key] = abilityModifier(statBlock.abilities?.[key] ?? 10);
    }
  }
  return result;
}

/** Set one attribute modifier, storing it explicitly rather than as a score. */
export function setAttributeModifier(
  statBlock: NpcStatBlock,
  key: AbilityKey,
  value: number
): NpcStatBlock {
  return {
    ...statBlock,
    attributeModifiers: { ...readAttributeModifiers(statBlock), [key]: value },
  };
}

/** Set a save or skill modifier. Fantasy d20 values are stored verbatim. */
export function setFantasyD20Bonus(
  statBlock: NpcStatBlock,
  kind: 'savingThrows' | 'skills',
  key: string,
  value: number | null
): NpcStatBlock {
  const record = { ...(statBlock[kind] ?? {}) };
  if (value === null) delete record[key];
  else record[key] = value;

  return { ...statBlock, [kind]: Object.keys(record).length > 0 ? record : undefined };
}

/**
 * An approximate plausible range for a Fantasy d20 modifier at a given level.
 *
 * **This is not the game's benchmark table.** It is a loose band fitted to
 * the published anchors (a level 5 extreme Perception is +17, a level 15
 * extreme skill is +33) and exists only to catch a typo — a +40 on a level 2
 * creature. Values inside the band are not endorsed as correct, and values
 * outside it are warned about, never changed. Real creature building should
 * use the game's creature guidance.
 */
export function fantasyD20PlausibleRange(level: number): { min: number; max: number } {
  const safeLevel = Number.isFinite(level) ? level : 1;
  return { min: safeLevel - 5, max: safeLevel * 2 + 12 };
}

/** True when a modifier is far enough outside the band to look like a mistake. */
export function isFantasyD20Implausible(bonus: number, level: number | undefined): boolean {
  if (typeof level !== 'number') return false;
  const { min, max } = fantasyD20PlausibleRange(level);
  return bonus < min || bonus > max;
}

/** Render a Fantasy d20 save line the way a stat block prints it. */
export function formatFantasyD20Saves(saves: Record<string, number>): string {
  return FANTASY_D20_SAVES.filter((s) => typeof saves[s.key] === 'number')
    .map((s) => `${s.short} ${formatModifier(saves[s.key])}`)
    .join(', ');
}
