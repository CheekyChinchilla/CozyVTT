/**
 * Dodge on a Call of Cthulhu 7e sheet.
 *
 * The rulebook lists the skill as "Dodge (half DEX)": half DEX, rounded down,
 * is its base value, the way every other skill has a fixed base. Occupation
 * and personal-interest points are added to it, and it improves with
 * experience like any other skill, so the value is the base plus whatever the
 * investigator has put in. Only the base can be worked out from the sheet.
 */

import type { CoC7eSkill } from '@/types/game-systems';

/** The highest skill value the sheet can store. */
const MAX_SKILL_VALUE = 100;

/** Dodge's base for an investigator's DEX: half, rounded down. */
export function cocDodgeBase(dex: number): number {
  return Number.isFinite(dex) ? Math.floor(dex / 2) : 0;
}

/**
 * Dodge with its base set for the investigator's DEX.
 *
 * `previousBase` is the base before a DEX change made in the editor, so the
 * points spent above the old base stay spent above the new one. When the sheet
 * is only being opened it is null, and the stored value is kept as it is.
 * Either way the value is never left below the base.
 *
 * Returns the same object when nothing changes.
 */
export function settleDodge(skill: CoC7eSkill, base: number, previousBase: number | null): CoC7eSkill {
  const stored = Number.isFinite(skill.currentValue) ? skill.currentValue : base;
  const moved = previousBase === null ? stored : stored + (base - previousBase);
  const currentValue = Math.min(MAX_SKILL_VALUE, Math.max(base, moved));
  if (skill.baseValue === base && skill.currentValue === currentValue) return skill;
  return { ...skill, baseValue: base, currentValue };
}
