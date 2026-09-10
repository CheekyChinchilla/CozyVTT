/**
 * npcRolls.ts
 * Builds the rollable options offered for an NPC token's stat block.
 *
 * NPC actions are stored as { name, description } pairs — dice formulas live
 * inside the description text — so attacks and damage are parsed out of that
 * prose. Abilities, saves and skills come from the structured fields.
 *
 * Dispatches on game system. This previously applied D&D 5e maths to every
 * system, so a Call of Cthulhu NPC was offered 1d20 + ability modifier rolls
 * for a game that has neither d20s nor ability modifiers. Systems without a
 * derived model now return no options and the caller falls back to the
 * free-form custom roll input, which is honest rather than confidently wrong.
 */

import {
  type RollOption,
  type CharacterRolls,
  isValidDiceExpression,
} from './characterRolls';
import type { NpcStatBlock } from '@/types';
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  abilityModifier,
  findSkill,
  formatModifier,
  skillLabel,
} from './rules/dnd5e';

// A creature's stat block carries a `hitDice` string for working out its hit
// points, not a pool it spends on a short rest, so there is nothing to offer.
const EMPTY_ROLLS: CharacterRolls = { abilities: [], skills: [], savingThrows: [], combat: [], hitDice: [] };

/** D&D 5e ability modifier: floor((score - 10) / 2). */
export { abilityModifier as abilityMod };

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
// Combat extraction — shared by the d20 systems
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
          label:             `${name} (Attack ${formatModifier(atkBonus)})`,
          expression:        `1d20${formatModifier(atkBonus)}`,
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
// D&D 5e
// ---------------------------------------------------------------------------

function buildDnd5eRolls(statBlock: NpcStatBlock): CharacterRolls {
  const abilities:    RollOption[] = [];
  const skills:       RollOption[] = [];
  const savingThrows: RollOption[] = [];

  const proficientSaves = statBlock.proficiencies?.saves ?? {};
  const proficientSkills = statBlock.proficiencies?.skills ?? {};

  // Ability checks — always all six.
  for (const ability of ABILITY_KEYS) {
    const mod = abilityModifier(statBlock.abilities?.[ability] ?? 10);
    abilities.push({
      label:             `${ability.toUpperCase()} ${formatModifier(mod)}`,
      expression:        `1d20${formatModifier(mod)}`,
      purpose:           `${ABILITY_LABELS[ability]} Check`,
      supportsAdvantage: true,
    });
  }

  // Saving throws — all six, using the stored total where the creature is
  // proficient and the bare ability modifier otherwise, so the DM always has
  // every save available.
  const storedSaves = statBlock.savingThrows ?? {};
  for (const ability of ABILITY_KEYS) {
    const stored = storedSaves[ability];
    const hasBonus = typeof stored === 'number';
    const bonus = hasBonus ? stored : abilityModifier(statBlock.abilities?.[ability] ?? 10);
    const level = proficientSaves[ability];
    const marker = level === 'expertise' ? ' ◆' : hasBonus ? ' ●' : '';

    savingThrows.push({
      label:             `${ABILITY_LABELS[ability]} Save ${formatModifier(bonus)}${marker}`,
      expression:        `1d20${formatModifier(bonus)}`,
      purpose:           `${ABILITY_LABELS[ability]} Saving Throw`,
      supportsAdvantage: true,
    });
  }

  // Skills the stat block records a bonus for, the way a printed stat block
  // lists only the skills a creature is actually trained in. Everything else is
  // covered by the ability checks above.
  for (const [rawKey, bonus] of Object.entries(statBlock.skills ?? {})) {
    if (typeof bonus !== 'number') continue;
    const definition = findSkill(rawKey);
    const display = skillLabel(rawKey);
    const level = proficientSkills[rawKey];
    const marker = level === 'expertise' ? ' ◆' : '';
    const abilitySuffix = definition ? ` (${definition.ability.toUpperCase()})` : '';

    skills.push({
      label:             `${display} ${formatModifier(bonus)}${abilitySuffix}${marker}`,
      expression:        `1d20${formatModifier(bonus)}`,
      purpose:           `${display} Check`,
      supportsAdvantage: true,
    });
  }

  return { abilities, skills, savingThrows, combat: buildCombatRolls(statBlock), hitDice: [] };
}

// ---------------------------------------------------------------------------
// Pathfinder 2e
// ---------------------------------------------------------------------------

/**
 * Pathfinder 2e creature stat blocks print final modifiers rather than the
 * components behind them — Paizo builds creatures from level benchmark tables,
 * not from "level + proficiency rank + attribute". So nothing is derived here:
 * whatever the stat block records is what gets rolled.
 *
 * Saves are Fortitude/Reflex/Will rather than six ability saves, and only
 * trained-or-better skills appear, both of which the stat block already
 * represents as plain keyed records.
 */
const PF2E_SAVE_LABELS: Record<string, string> = {
  fortitude: 'Fortitude',
  reflex: 'Reflex',
  will: 'Will',
};

function buildPf2eRolls(statBlock: NpcStatBlock): CharacterRolls {
  const abilities:    RollOption[] = [];
  const skills:       RollOption[] = [];
  const savingThrows: RollOption[] = [];

  // PF2e stat blocks list attribute modifiers directly. Where a creature was
  // entered with 5e-style scores instead, fall back to deriving the modifier so
  // the option is still offered rather than silently dropped.
  for (const ability of ABILITY_KEYS) {
    const stored = statBlock.attributeModifiers?.[ability];
    const mod =
      typeof stored === 'number'
        ? stored
        : abilityModifier(statBlock.abilities?.[ability] ?? 10);

    abilities.push({
      label:             `${ability.toUpperCase()} ${formatModifier(mod)}`,
      expression:        `1d20${formatModifier(mod)}`,
      purpose:           `${ABILITY_LABELS[ability]} Check`,
      supportsAdvantage: true, // Fortune / Misfortune
    });
  }

  for (const [key, bonus] of Object.entries(statBlock.savingThrows ?? {})) {
    if (typeof bonus !== 'number') continue;
    const label = PF2E_SAVE_LABELS[key.toLowerCase()] ?? key;
    savingThrows.push({
      label:             `${label} ${formatModifier(bonus)}`,
      expression:        `1d20${formatModifier(bonus)}`,
      purpose:           `${label} Save`,
      supportsAdvantage: true,
    });
  }

  for (const [key, bonus] of Object.entries(statBlock.skills ?? {})) {
    if (typeof bonus !== 'number') continue;
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    skills.push({
      label:             `${label} ${formatModifier(bonus)}`,
      expression:        `1d20${formatModifier(bonus)}`,
      purpose:           `${label} Check`,
      supportsAdvantage: true,
    });
  }

  return { abilities, skills, savingThrows, combat: buildCombatRolls(statBlock), hitDice: [] };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Game systems for which NPC stat blocks have a modelled roll structure. */
export function systemSupportsNpcRolls(gameSystem: string | null | undefined): boolean {
  return gameSystem === 'DND_5E' || gameSystem === 'PATHFINDER_2E';
}

/**
 * Build the rollable options for an NPC stat block.
 *
 * @param statBlock  The token's stat block, if it has one.
 * @param gameSystem The campaign's game system. Defaults to D&D 5e, which is
 *                   what the stat block structure was designed around and what
 *                   the only seeded content uses.
 *
 * Call of Cthulhu 7e and Shadowrun 6e return no options: they use d100 and dice
 * pools respectively, with no ability-modifier or proficiency concept, so there
 * is nothing correct to offer from this data. Callers fall back to the custom
 * roll input.
 */
export function buildNpcRolls(
  statBlock: NpcStatBlock | null | undefined,
  gameSystem: string | null = 'DND_5E'
): CharacterRolls {
  if (!statBlock) return EMPTY_ROLLS;

  switch (gameSystem) {
    case 'PATHFINDER_2E':
      return buildPf2eRolls(statBlock);
    case 'DND_5E':
      return buildDnd5eRolls(statBlock);
    case 'CALL_OF_CTHULHU_7E':
    case 'SHADOWRUN_6E':
      return EMPTY_ROLLS;
    default:
      // Unknown or unset system: the stat block shape is 5e's, so treat it as
      // 5e rather than offering nothing at all.
      return buildDnd5eRolls(statBlock);
  }
}
