/**
 * npcRolls.ts
 * Extracts rollable dice expressions from an NPC token's stat block.
 *
 * NPC actions are stored as { name, description } pairs — dice formulas live
 * inside the description text. This utility parses those descriptions to
 * surface attack rolls and damage rolls in the same RollOption format used
 * by player characters (see characterRolls.ts).
 *
 * D&D 5e is fully supported. For other systems or tokens without stat blocks,
 * callers should fall back to a free-form custom roll input.
 */

import {
  type RollOption,
  type CharacterRolls,
  isValidDiceExpression,
} from './characterRolls';
import type { NpcStatBlock } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/** D&D 5e ability modifier: floor((score - 10) / 2). */
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Extract the first attack bonus ("+N to hit" or "-N to hit") from an
 * action description. Returns null if none is found.
 */
export function extractAttackBonus(description: string): number | null {
  if (!description) return null;
  const m = description.match(/([+-]\s*\d+)\s+to\s+hit/i);
  if (!m) return null;
  const n = parseInt(m[1].replace(/\s+/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extract every dice expression of the form `XdY` or `XdY+Z` / `XdY-Z`
 * from a description, in source order. Skips bare numbers like "+10" that
 * aren't attached to a die roll.
 */
export function extractDiceExpressions(description: string): string[] {
  if (!description) return [];
  const matches = description.match(/\b\d+d\d+(?:\s*[+-]\s*\d+)?\b/gi);
  if (!matches) return [];
  return matches.map((m) => m.replace(/\s+/g, ''));
}

// ---------------------------------------------------------------------------
// 5e ability + skill scaffolding
// ---------------------------------------------------------------------------

const ABILITY_LABELS: Array<[keyof NpcStatBlock['abilities'], string]> = [
  ['str', 'Strength'],
  ['dex', 'Dexterity'],
  ['con', 'Constitution'],
  ['int', 'Intelligence'],
  ['wis', 'Wisdom'],
  ['cha', 'Charisma'],
];

/** Default ability associated with each named 5e skill. */
const SKILL_ABILITY: Record<string, keyof NpcStatBlock['abilities']> = {
  acrobatics: 'dex',
  'animal handling': 'wis',
  animalHandling: 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  'sleight of hand': 'dex',
  sleightOfHand: 'dex',
  stealth: 'dex',
  survival: 'wis',
};

function titleCase(s: string): string {
  return s.replace(/(^|\s|-)\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Combat extraction (5e)
// ---------------------------------------------------------------------------

type ActionEntry = { name: string; description: string };

function buildCombatRolls(statBlock: NpcStatBlock): RollOption[] {
  const combat: RollOption[] = [];

  const sources: Array<{ list: ActionEntry[] | undefined; label: string }> = [
    { list: statBlock.actions,          label: 'Action' },
    { list: statBlock.bonusActions,     label: 'Bonus Action' },
    { list: statBlock.reactions,        label: 'Reaction' },
    { list: statBlock.legendaryActions, label: 'Legendary' },
  ];

  for (const { list, label } of sources) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!entry?.name) continue;
      const name = entry.name.trim();
      const description = entry.description ?? '';

      // Attack roll
      const atkBonus = extractAttackBonus(description);
      if (atkBonus !== null) {
        combat.push({
          label:             `${name} (Attack ${fmt(atkBonus)})`,
          expression:        `1d20${fmt(atkBonus)}`,
          purpose:           `${name} Attack`,
          supportsAdvantage: true,
        });
      }

      // Damage rolls — every dice expression in the description, in order.
      const dice = extractDiceExpressions(description);
      if (dice.length === 0) continue;

      // If there's an attack, the first die is typically primary damage.
      // If there's no attack (e.g. a save-for-half AoE), all dice are damage.
      dice.forEach((expr, idx) => {
        if (!isValidDiceExpression(expr)) return;
        const suffix = dice.length > 1 ? ` ${idx + 1}` : '';
        combat.push({
          label:             `${name} (${label === 'Action' ? 'Damage' : `${label} Damage`}${suffix} ${expr})`,
          expression:        expr,
          purpose:           `${name} Damage${suffix}`,
          supportsAdvantage: false,
        });
      });
    }
  }

  return combat;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the full set of rollable options for an NPC stat block.
 * Currently models 5e ability/save/skill math; works as a sensible default
 * for any d20-style system.
 */
export function buildNpcRolls(statBlock: NpcStatBlock | null | undefined): CharacterRolls {
  if (!statBlock) {
    return { abilities: [], skills: [], savingThrows: [], combat: [] };
  }

  const abilities:    RollOption[] = [];
  const skills:       RollOption[] = [];
  const savingThrows: RollOption[] = [];

  // Ability checks
  for (const [key, name] of ABILITY_LABELS) {
    const score = statBlock.abilities?.[key] ?? 10;
    const mod = abilityMod(score);
    abilities.push({
      label:             `${key.toUpperCase()} ${fmt(mod)}`,
      expression:        `1d20${fmt(mod)}`,
      purpose:           `${name} Check`,
      supportsAdvantage: true,
    });
  }

  // Saving throws — explicit overrides, falling back to ability modifier
  // for the six core abilities so the DM always has all six available.
  const saveOverrides = statBlock.savingThrows || {};
  for (const [key, name] of ABILITY_LABELS) {
    const override = saveOverrides[key];
    const bonus = typeof override === 'number'
      ? override
      : abilityMod(statBlock.abilities?.[key] ?? 10);
    const isProficient = typeof override === 'number';
    savingThrows.push({
      label:             `${name} Save ${fmt(bonus)}${isProficient ? ' ●' : ''}`,
      expression:        `1d20${fmt(bonus)}`,
      purpose:           `${name} Saving Throw`,
      supportsAdvantage: true,
    });
  }

  // Skills — only the skills the DM has explicitly added bonuses for.
  if (statBlock.skills) {
    for (const [rawKey, bonus] of Object.entries(statBlock.skills)) {
      if (typeof bonus !== 'number') continue;
      const key = rawKey.trim();
      const ability = SKILL_ABILITY[key.toLowerCase()] || SKILL_ABILITY[key];
      const display = titleCase(key.replace(/([A-Z])/g, ' $1').trim());
      skills.push({
        label:             `${display} ${fmt(bonus)}${ability ? ` (${ability.toUpperCase()})` : ''}`,
        expression:        `1d20${fmt(bonus)}`,
        purpose:           `${display} Check`,
        supportsAdvantage: true,
      });
    }
  }

  const combat = buildCombatRolls(statBlock);

  return { abilities, skills, savingThrows, combat };
}
