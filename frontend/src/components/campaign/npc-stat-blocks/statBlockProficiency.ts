/**
 * statBlockProficiency.ts
 * Reads and writes the proficiency side of a D&D 5e creature stat block.
 *
 * A stat block stores saves and skills as final totals — that is the format the
 * roll picker, the viewer, campaign export and every seeded SRD creature use,
 * and it is not changing. What this module adds is the *reason* for each total:
 * whether it is a plain ability check, a proficient one, an expert one, or a
 * value set by hand.
 *
 * Two rules make this backward compatible with every stat block already stored:
 *
 *  1. When no proficiency metadata exists, the level is inferred from the
 *     printed total. An SRD Goblin with Stealth +6, Dex 14 and CR 1/4 reads
 *     back as expertise without its number changing.
 *  2. Anything that does not decompose cleanly is 'custom' and is preserved
 *     exactly, never "corrected".
 */

import type { NpcProficiencies, NpcStatBlock, ProficiencyLevel } from '@/types';
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  DND5E_SKILLS,
  abilityModifier,
  decomposeBonus,
  derivedBonus,
  findSkill,
  formatModifier,
  proficiencyBonusForCR,
  type AbilityKey,
} from '@/utils/rules/dnd5e';

/** One row in the saves or skills editor. */
export interface ProficiencyRow {
  /** Canonical key as stored in the stat block. */
  key: string;
  label: string;
  /** The ability this uses, or null for an unrecognised custom skill. */
  ability: AbilityKey | null;
  level: ProficiencyLevel;
  /** The bonus that will actually be rolled. */
  bonus: number;
  /** What the bonus would be if derived — shown as a hint when overridden. */
  derived: number;
  /** True when this key is not one of the standard 5e skills. */
  isCustomSkill: boolean;
  /**
   * True when an overridden bonus sits far outside anything this creature could
   * reach by the rules — a commoner with a +30 save. Advisory only: overrides
   * stay allowed, but the editor marks them so a typo is obvious.
   */
  implausible: boolean;
}

/**
 * The widest bonus a creature could plausibly have.
 *
 * Ability modifier plus three times the proficiency bonus: expertise is twice,
 * and the extra step leaves room for magic items and NPC class levels without
 * flagging legitimate stat blocks. A Wisdom 14 commoner tops out at +8 here, so
 * the +30 from the bug report is clearly outside it, while an ancient dragon's
 * printed values sit comfortably inside.
 */
function plausibleRange(abilityMod: number, pb: number): { min: number; max: number } {
  return { min: abilityMod - pb, max: abilityMod + pb * 3 };
}

/** Which half of the stat block a row belongs to. */
export type ProficiencyKind = 'saves' | 'skills';

const RECORD_FIELD: Record<ProficiencyKind, 'savingThrows' | 'skills'> = {
  saves: 'savingThrows',
  skills: 'skills',
};

/**
 * The proficiency bonus in effect for a creature.
 *
 * Derived from challenge rating, since a monster's proficiency bonus follows
 * its CR on the same curve a character's follows level. An explicit override
 * wins, for the rare published monster whose printed values do not match.
 */
export function getProficiencyBonus(statBlock: NpcStatBlock): number {
  const override = statBlock.proficiencies?.bonusOverride;
  if (typeof override === 'number') return override;
  return proficiencyBonusForCR(statBlock.challengeRating);
}

/** True when the proficiency bonus was set by hand rather than taken from CR. */
export function hasProficiencyOverride(statBlock: NpcStatBlock): boolean {
  return typeof statBlock.proficiencies?.bonusOverride === 'number';
}

function abilityModFor(statBlock: NpcStatBlock, ability: AbilityKey | null): number {
  if (!ability) return 0;
  return abilityModifier(statBlock.abilities?.[ability] ?? 10);
}

/**
 * Resolve one row's level and bonus.
 *
 * `storedTotal` is whatever the stat block currently holds (undefined if the
 * creature has no entry), and `storedLevel` is the recorded proficiency, if any.
 */
function resolveRow(
  statBlock: NpcStatBlock,
  key: string,
  label: string,
  ability: AbilityKey | null,
  storedTotal: number | undefined,
  storedLevel: ProficiencyLevel | undefined,
  isCustomSkill: boolean
): ProficiencyRow {
  const abilityMod = abilityModFor(statBlock, ability);
  const pb = getProficiencyBonus(statBlock);

  // An unrecognised skill has no ability to derive from, so it is always
  // custom — and with no ability to compare against, never flagged.
  if (isCustomSkill) {
    const bonus = storedTotal ?? 0;
    return {
      key,
      label,
      ability,
      level: 'custom',
      bonus,
      derived: bonus,
      isCustomSkill,
      implausible: false,
    };
  }

  const level: ProficiencyLevel =
    storedLevel ??
    (storedTotal === undefined ? 'none' : decomposeBonus(storedTotal, abilityMod, pb));

  if (level === 'custom') {
    const bonus = storedTotal ?? abilityMod;
    const { min, max } = plausibleRange(abilityMod, pb);
    return {
      key,
      label,
      ability,
      level,
      bonus,
      derived: derivedBonus(abilityMod, pb, 'proficient'),
      isCustomSkill,
      implausible: bonus < min || bonus > max,
    };
  }

  // Derived bonuses are correct by construction, so never flagged.
  const bonus = derivedBonus(abilityMod, pb, level);
  return { key, label, ability, level, bonus, derived: bonus, isCustomSkill, implausible: false };
}

/** The six saving throws, always all of them so the DM can pick any. */
export function readSaveRows(statBlock: NpcStatBlock): ProficiencyRow[] {
  const totals = statBlock.savingThrows ?? {};
  const levels = statBlock.proficiencies?.saves ?? {};

  return ABILITY_KEYS.map((ability) =>
    resolveRow(
      statBlock,
      ability,
      ABILITY_LABELS[ability],
      ability,
      totals[ability],
      levels[ability],
      false
    )
  );
}

/**
 * The eighteen 5e skills, plus any custom skill the stat block already carries.
 *
 * Standard skills always appear so a DM can tick one without knowing how to
 * spell it — the previous editor required typing the key by hand, which
 * accepted "perceptoin" as a distinct skill.
 */
export function readSkillRows(statBlock: NpcStatBlock): ProficiencyRow[] {
  const totals = statBlock.skills ?? {};
  const levels = statBlock.proficiencies?.skills ?? {};

  const standard = DND5E_SKILLS.map((skill) =>
    resolveRow(
      statBlock,
      skill.key,
      skill.label,
      skill.ability,
      totals[skill.key],
      levels[skill.key],
      false
    )
  );

  // Keys that are not standard skills — imported oddities and homebrew. Kept so
  // saving a creature never silently drops a skill someone relied on.
  const custom = Object.keys(totals)
    .filter((key) => findSkill(key) === null)
    .map((key) => resolveRow(statBlock, key, key, null, totals[key], levels[key], true));

  return [...standard, ...custom];
}

/**
 * Write a set of rows back into a stat block.
 *
 * Only rows that carry a bonus are stored: a creature is not "proficient in
 * nothing" eighteen times over. This keeps stat blocks the same shape and size
 * as the SRD data they came from, and keeps the roll picker listing the skills
 * a creature is actually good at.
 */
function writeRows(
  statBlock: NpcStatBlock,
  kind: ProficiencyKind,
  rows: ProficiencyRow[]
): NpcStatBlock {
  const totals: Record<string, number> = {};
  const levels: Record<string, ProficiencyLevel> = {};

  for (const row of rows) {
    if (row.level === 'none') continue;
    totals[row.key] = row.bonus;
    levels[row.key] = row.level;
  }

  const proficiencies: NpcProficiencies = { ...statBlock.proficiencies };
  if (Object.keys(levels).length > 0) proficiencies[kind] = levels;
  else delete proficiencies[kind];

  const hasProficiencyData =
    proficiencies.saves !== undefined ||
    proficiencies.skills !== undefined ||
    proficiencies.bonusOverride !== undefined;

  return {
    ...statBlock,
    [RECORD_FIELD[kind]]: Object.keys(totals).length > 0 ? totals : undefined,
    proficiencies: hasProficiencyData ? proficiencies : undefined,
  };
}

/** Set one row's proficiency level, recomputing its bonus. */
export function setProficiencyLevel(
  statBlock: NpcStatBlock,
  kind: ProficiencyKind,
  key: string,
  level: ProficiencyLevel
): NpcStatBlock {
  const rows = kind === 'saves' ? readSaveRows(statBlock) : readSkillRows(statBlock);
  const ability = kind === 'saves' ? (key as AbilityKey) : (findSkill(key)?.ability ?? null);
  const abilityMod = abilityModFor(statBlock, ability);
  const pb = getProficiencyBonus(statBlock);

  const updated = rows.map((row) => {
    if (row.key !== key) return row;
    if (level === 'custom') {
      // Entering override mode keeps whatever the value already was, so the
      // number does not jump the moment the DM chooses to edit it.
      return { ...row, level, derived: derivedBonus(abilityMod, pb, 'proficient') };
    }
    const bonus = derivedBonus(abilityMod, pb, level);
    return { ...row, level, bonus, derived: bonus };
  });

  return writeRows(statBlock, kind, updated);
}

/** Set an explicit bonus for one row, marking it as a custom override. */
export function setBonusOverride(
  statBlock: NpcStatBlock,
  kind: ProficiencyKind,
  key: string,
  bonus: number
): NpcStatBlock {
  const rows = kind === 'saves' ? readSaveRows(statBlock) : readSkillRows(statBlock);
  const updated = rows.map((row) =>
    row.key === key ? { ...row, level: 'custom' as ProficiencyLevel, bonus } : row
  );
  return writeRows(statBlock, kind, updated);
}

/** Remove a custom skill row entirely. */
export function removeCustomSkill(statBlock: NpcStatBlock, key: string): NpcStatBlock {
  const rows = readSkillRows(statBlock).filter((row) => row.key !== key);
  return writeRows(statBlock, 'skills', rows);
}

/**
 * Recompute every derived bonus.
 *
 * Called when an ability score, the challenge rating or the proficiency bonus
 * changes — raising a creature's Wisdom has to move its Perception. Rows marked
 * 'custom' keep their value, which is the point of marking them.
 */
export function recomputeDerivedBonuses(statBlock: NpcStatBlock): NpcStatBlock {
  const withSaves = writeRows(statBlock, 'saves', readSaveRows(statBlock));
  return writeRows(withSaves, 'skills', readSkillRows(withSaves));
}

/**
 * Change ability scores or the challenge rating, and every derived save and
 * skill with them.
 *
 * Each row's level is recorded first, inferred from the stored total where
 * the stat block records none (every SRD creature), so the new totals follow
 * the creature's proficiencies. Inferred afresh against the new numbers, a
 * row no longer fitted and froze as custom at its old total: a Goblin given
 * Dexterity 16 kept Stealth +6, and typing "16" froze every row at the "1"
 * on the way.
 */
export function changeAbilitiesOrRating(
  statBlock: NpcStatBlock,
  changes: Partial<Pick<NpcStatBlock, 'abilities' | 'challengeRating'>>
): NpcStatBlock {
  return recomputeDerivedBonuses({ ...recomputeDerivedBonuses(statBlock), ...changes });
}

/**
 * Render a saving-throw record the way a stat block prints it: "Dex +5, Wis +3".
 *
 * Uses formatModifier rather than a hardcoded "+", which previously rendered a
 * negative save as "Dex +-1".
 */
export function formatSaveList(saves: Record<string, number>): string {
  return Object.entries(saves)
    .map(([key, bonus]) => {
      // Stat blocks abbreviate the six abilities' saves ("Dex +5"); any other
      // save (a Pathfinder "fortitude" seen in another system) is printed
      // whole, where cutting it made "for".
      const label = ABILITY_LABELS[key as AbilityKey];
      const shown = label ? label.slice(0, 3) : key.charAt(0).toUpperCase() + key.slice(1);
      return `${shown} ${formatModifier(bonus)}`;
    })
    .join(', ');
}

/**
 * Render a skill record the way a stat block prints it:
 * "Perception +4, Sleight of Hand +6".
 *
 * Resolves the display name through the skill table, so camelCase and Open5e's
 * snake_case keys both read properly instead of appearing as "SleightOfHand".
 */
export function formatSkillList(skills: Record<string, number>): string {
  return Object.entries(skills)
    .map(([key, bonus]) => {
      const label = findSkill(key)?.label ?? key.charAt(0).toUpperCase() + key.slice(1);
      return `${label} ${formatModifier(bonus)}`;
    })
    .join(', ');
}

/** Set or clear the manual proficiency-bonus override, recomputing everything. */
export function setProficiencyBonusOverride(
  statBlock: NpcStatBlock,
  bonus: number | null
): NpcStatBlock {
  const proficiencies: NpcProficiencies = { ...statBlock.proficiencies };
  if (bonus === null) delete proficiencies.bonusOverride;
  else proficiencies.bonusOverride = bonus;

  const hasProficiencyData =
    proficiencies.saves !== undefined ||
    proficiencies.skills !== undefined ||
    proficiencies.bonusOverride !== undefined;

  return recomputeDerivedBonuses({
    ...statBlock,
    proficiencies: hasProficiencyData ? proficiencies : undefined,
  });
}
