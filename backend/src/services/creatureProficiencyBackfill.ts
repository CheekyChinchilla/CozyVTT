/**
 * creatureProficiencyBackfill.ts
 * Records *why* a seeded SRD creature's saves and skills are what they are.
 *
 * SRD creatures are imported from Open5e, which supplies only final totals — a
 * Goblin arrives as `{ stealth: 6 }` with no indication that this is Dex +2 plus
 * a doubled proficiency bonus. Without that, the editor cannot show the right
 * checkboxes and the rules model has nothing to work from.
 *
 * Two hard rules, both enforced by tests:
 *
 *  1. **No printed number changes.** This records structure alongside the
 *     existing totals; it never recomputes a bonus. A value that cannot be
 *     reconciled with the rules is marked 'custom' and left exactly as it is,
 *     not "corrected".
 *  2. **SRD creatures only.** Rows with any other `source` are never read or
 *     written. A GM's homebrew is their own.
 *
 * It also normalises Open5e's snake_case skill keys ("animal_handling") onto the
 * canonical camelCase ones. That is a key change, not a value change, and fixes
 * a live defect: those keys never matched the skill lookup, so those skills lost
 * their ability association in the roll picker.
 */

import { prisma } from '../config/database';
import {
  abilityModifier,
  decomposeBonus,
  findSkill,
  normalizeSkillKey,
  proficiencyBonusForCR,
  type ProficiencyLevel,
} from '../utils/rules/fifthEdition';
import logger from '../utils/logger';

/** Minimal shape this service needs; stat blocks are JSONB and vary in age. */
interface StatBlockLike {
  abilities?: Record<string, number>;
  savingThrows?: Record<string, number>;
  skills?: Record<string, number>;
  challengeRating?: string;
  proficiencies?: {
    bonusOverride?: number;
    saves?: Record<string, ProficiencyLevel>;
    skills?: Record<string, ProficiencyLevel>;
  };
  [key: string]: unknown;
}

export interface BackfillChange {
  creatureId: string;
  name: string;
  /** Skill keys renamed from Open5e's snake_case to the canonical form. */
  renamedSkills: Array<{ from: string; to: string }>;
  /** Proficiency levels inferred, keyed by save/skill. */
  saves: Record<string, ProficiencyLevel>;
  skills: Record<string, ProficiencyLevel>;
}

export interface BackfillResult {
  scanned: number;
  changed: number;
  skippedAlreadyDone: number;
  /** Entries that could not be reconciled with the rules and were left alone. */
  customEntries: number;
  changes: BackfillChange[];
  dryRun: boolean;
}

/**
 * Work out the proficiency structure for one stat block.
 * Returns null when there is nothing to record.
 */
export function planStatBlockBackfill(
  statBlock: StatBlockLike
): { statBlock: StatBlockLike; change: Omit<BackfillChange, 'creatureId' | 'name'>; customCount: number } | null {
  const abilities = statBlock.abilities ?? {};
  const pb = proficiencyBonusForCR(statBlock.challengeRating);

  const saveLevels: Record<string, ProficiencyLevel> = {};
  const skillLevels: Record<string, ProficiencyLevel> = {};
  const renamedSkills: Array<{ from: string; to: string }> = [];
  let customCount = 0;

  // Saves are keyed by the three-letter ability, matching the importer.
  for (const [key, total] of Object.entries(statBlock.savingThrows ?? {})) {
    if (typeof total !== 'number') continue;
    const mod = abilityModifier(abilities[key] ?? 10);
    const level = decomposeBonus(total, mod, pb);
    saveLevels[key] = level;
    if (level === 'custom') customCount += 1;
  }

  // Skills may arrive under Open5e's snake_case names.
  const normalisedSkills: Record<string, number> = {};
  for (const [rawKey, total] of Object.entries(statBlock.skills ?? {})) {
    if (typeof total !== 'number') continue;

    const canonical = normalizeSkillKey(rawKey);
    if (canonical !== rawKey) renamedSkills.push({ from: rawKey, to: canonical });
    normalisedSkills[canonical] = total;

    const definition = findSkill(canonical);
    if (!definition) {
      // An unrecognised skill has no ability to decompose against.
      skillLevels[canonical] = 'custom';
      customCount += 1;
      continue;
    }

    const mod = abilityModifier(abilities[definition.ability] ?? 10);
    const level = decomposeBonus(total, mod, pb);
    skillLevels[canonical] = level;
    if (level === 'custom') customCount += 1;
  }

  const hasSaves = Object.keys(saveLevels).length > 0;
  const hasSkills = Object.keys(skillLevels).length > 0;
  if (!hasSaves && !hasSkills) return null;

  const updated: StatBlockLike = {
    ...statBlock,
    // Totals are rewritten only to apply the key rename; every value is the
    // one that was already stored.
    ...(hasSkills && { skills: normalisedSkills }),
    proficiencies: {
      ...statBlock.proficiencies,
      ...(hasSaves && { saves: saveLevels }),
      ...(hasSkills && { skills: skillLevels }),
    },
  };

  return {
    statBlock: updated,
    change: { renamedSkills, saves: saveLevels, skills: skillLevels },
    customCount,
  };
}

/**
 * Backfill proficiency structure across every seeded SRD creature.
 *
 * @param options.dryRun Report what would change without writing anything.
 */
export async function backfillCreatureProficiency(
  options: { dryRun?: boolean } = {}
): Promise<BackfillResult> {
  const dryRun = options.dryRun ?? false;

  // The filter that keeps this off anyone's homebrew.
  const creatures = await prisma.creatureTemplate.findMany({
    where: { source: 'srd' },
    select: { id: true, name: true, statBlock: true },
  });

  const result: BackfillResult = {
    scanned: creatures.length,
    changed: 0,
    skippedAlreadyDone: 0,
    customEntries: 0,
    changes: [],
    dryRun,
  };

  for (const creature of creatures) {
    const statBlock = creature.statBlock as StatBlockLike | null;
    if (!statBlock || typeof statBlock !== 'object') continue;

    // Idempotent: a creature that already carries proficiency data is left be.
    if (statBlock.proficiencies?.saves || statBlock.proficiencies?.skills) {
      result.skippedAlreadyDone += 1;
      continue;
    }

    const plan = planStatBlockBackfill(statBlock);
    if (!plan) continue;

    result.changed += 1;
    result.customEntries += plan.customCount;
    result.changes.push({ creatureId: creature.id, name: creature.name, ...plan.change });

    if (!dryRun) {
      await prisma.creatureTemplate.update({
        where: { id: creature.id },
        data: { statBlock: plan.statBlock as object },
      });
    }
  }

  logger.info(
    `Creature proficiency backfill${dryRun ? ' (dry run)' : ''}: ` +
      `${result.changed} of ${result.scanned} SRD creatures updated, ` +
      `${result.skippedAlreadyDone} already done, ${result.customEntries} entries kept as custom.`
  );

  return result;
}
