/**
 * pf2eStatBlock.ts
 * Pathfinder 2e creature stat block helpers.
 *
 * PF2e works fundamentally differently from D&D 5e, and the previous code
 * applied 5e's model to it wholesale. The differences that matter here:
 *
 *  - Stat blocks print **attribute modifiers** ("Str +4"), not scores. There is
 *    no score behind them, so deriving one is an invention.
 *  - Creatures have a **Level**, not a Challenge Rating.
 *  - There are **three saves** — Fortitude, Reflex, Will — not six ability saves.
 *  - Only **trained-or-better** skills appear; an unlisted skill is untrained.
 *  - Modifiers are **not derived**. Paizo builds creatures from level benchmark
 *    tables rather than from "level + proficiency rank + attribute", so the
 *    printed number is the rule. Nothing in this module computes a bonus.
 *
 * Sources: Archives of Nethys, "Reading Creature Statistics" and "Building
 * Creatures", and the Pathfinder 2e Core Rulebook. Checked against both rather
 * than written from memory.
 */

import type { NpcStatBlock } from '@/types';
import { ABILITY_KEYS, abilityModifier, formatModifier, type AbilityKey } from '@/utils/rules/dnd5e';

/** The three PF2e saving throws, in the order stat blocks print them. */
export const PF2E_SAVES = [
  { key: 'fortitude', label: 'Fortitude', short: 'Fort' },
  { key: 'reflex', label: 'Reflex', short: 'Ref' },
  { key: 'will', label: 'Will', short: 'Will' },
] as const;

/** The sixteen core PF2e skills. Lore skills are added freely as custom keys. */
export const PF2E_SKILLS = [
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

/** Attribute labels as PF2e abbreviates them. */
export const PF2E_ATTRIBUTE_LABELS: Record<AbilityKey, string> = {
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
 * Prefers the explicit modifiers a PF2e stat block carries. Falls back to
 * deriving from `abilities` for creatures entered before that field existed, so
 * switching a campaign to PF2e shows sensible values rather than zeroes.
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

/** Set a save or skill modifier. PF2e values are stored verbatim. */
export function setPf2eBonus(
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
 * An approximate plausible range for a PF2e modifier at a given level.
 *
 * **This is not Paizo's benchmark table.** It is a loose band fitted to the
 * published anchors (a level 5 extreme Perception is +17, a level 15 extreme
 * skill is +33) and exists only to catch a typo — a +40 on a level 2 creature.
 * Values inside the band are not endorsed as correct, and values outside it are
 * warned about, never changed. Real creature building should use the benchmark
 * tables in the Gamemastery Guide.
 */
export function pf2ePlausibleRange(level: number): { min: number; max: number } {
  const safeLevel = Number.isFinite(level) ? level : 1;
  return { min: safeLevel - 5, max: safeLevel * 2 + 12 };
}

/** True when a modifier is far enough outside the band to look like a mistake. */
export function isPf2eImplausible(bonus: number, level: number | undefined): boolean {
  if (typeof level !== 'number') return false;
  const { min, max } = pf2ePlausibleRange(level);
  return bonus < min || bonus > max;
}

/** Render a PF2e save line the way a stat block prints it. */
export function formatPf2eSaves(saves: Record<string, number>): string {
  return PF2E_SAVES.filter((s) => typeof saves[s.key] === 'number')
    .map((s) => `${s.short} ${formatModifier(saves[s.key])}`)
    .join(', ');
}
