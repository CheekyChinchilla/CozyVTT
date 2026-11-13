// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

import type { CharacterData } from '@/types';
import { hitDieExpression, hitDiceMaximum, spendRoll, canSpendHitDie } from './hitDice';
import { isValidDiceExpression } from './diceExpression';
import { attackPurpose, damagePurpose, strikePurpose } from './rollPurposes';

// Re-exported so the many callers that reach for it here keep working.
export { isValidDiceExpression };
import { readCustomSkills, fifthEditionCustomSkillBonus, fifthEditionSkillBonus, fifthEditionSaveBonus } from '@/utils/rules/fifthEdition';
import { fantasyD20PerceptionTotal, fantasyD20SaveTotal, fantasyD20SkillTotal } from '@/utils/rules/fantasyD20';
import {
  HORROR_D100_CHARACTERISTIC_ROLLS,
  horrorD100CharacteristicRoll,
  horrorD100DamageModifier,
  horrorD100DamageWithModifier,
  horrorD100WeaponSkillRating,
} from '@/utils/rules/horrorD100';
import { horrorD100NamedSkills } from '@/constants/horrorD100SkillNames';
import type {
  FifthEditionCharacterData,
  FifthEditionStats,
  FifthEditionSkills,
  FifthEditionSavingThrows,
  FantasyD20CharacterData,
  FantasyD20Attributes,
  FantasyD20SavingThrows,
  FantasyD20Skills,
  HorrorD100Sheet,
} from '@/types/game-systems';

/**
 * characterRolls.ts
 * Extracts rollable dice expressions from character data for any supported game system.
 *
 * Used by:
 *  - Click-to-roll elements inside character sheet views
 *  - CharacterRollPicker modal (right-click context menus on roster/tokens)
 */

export interface RollOption {
  /** Short label shown in menus / tooltips */
  label: string;
  /** Dice expression sent to the server (e.g. "1d20+5") */
  expression: string;
  /** Human-readable purpose shown in the dice roller history */
  purpose: string;
  /**
   * true for d20-based systems (5E, Fantasy d20): the caller may substitute
   * "2d20kh1" (advantage) or "2d20kl1" (disadvantage) in place of "1d20".
   */
  supportsAdvantage: boolean;
  /**
   * Set when rolling this spends a hit die: the position of the pool it comes
   * out of. The host tells the server, so the count is decremented once and
   * server-side rather than trusted from whoever rolled.
   */
  hitDiceIndex?: number;
}

export interface CharacterRolls {
  abilities:     RollOption[];   // Ability score / characteristic checks
  skills:        RollOption[];   // Skill checks
  savingThrows:  RollOption[];   // Saving throws / resistance rolls
  combat:        RollOption[];   // Attack rolls and damage rolls
  hitDice:       RollOption[];   // Spending a hit die on a short rest (5E)
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function fmt(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}



/**
 * One d20 standing alone at the start of an expression: followed by its end,
 * a sign or a space. `1d200` is another die, and `1d20kh1` keeps a die of its
 * own already, so neither is one. The dice parser reads `D` as `d`.
 */
const LEADING_D20 = /^1d20(?=$|[+\-\s])/i;

/**
 * Converts a normal-roll expression beginning with one d20 to an advantage
 * expression by replacing "1d20" with "2d20kh1".
 */
export function withAdvantage(expr: string): string {
  return expr.replace(LEADING_D20, '2d20kh1');
}

/**
 * Converts a normal-roll expression beginning with one d20 to a disadvantage
 * expression by replacing "1d20" with "2d20kl1".
 */
export function withDisadvantage(expr: string): string {
  return expr.replace(LEADING_D20, '2d20kl1');
}

// ---------------------------------------------------------------------------
// 5E
// ---------------------------------------------------------------------------

const FIFTH_EDITION_ABILITY_NAMES: Record<string, string> = {
  strength:     'Strength',
  dexterity:    'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom:       'Wisdom',
  charisma:     'Charisma',
};

const FIFTH_EDITION_SKILL_NAMES: Record<string, string> = {
  acrobatics:     'Acrobatics',
  animalHandling: 'Animal Handling',
  arcana:         'Arcana',
  athletics:      'Athletics',
  deception:      'Deception',
  history:        'History',
  insight:        'Insight',
  intimidation:   'Intimidation',
  investigation:  'Investigation',
  medicine:       'Medicine',
  nature:         'Nature',
  perception:     'Perception',
  performance:    'Performance',
  persuasion:     'Persuasion',
  religion:       'Religion',
  sleightOfHand:  'Sleight of Hand',
  stealth:        'Stealth',
  survival:       'Survival',
};

function extractFifthEditionRolls(data: FifthEditionCharacterData): CharacterRolls {
  const abilities: RollOption[] = [];
  const skills:    RollOption[] = [];
  const saves:     RollOption[] = [];
  const combat:    RollOption[] = [];

  // Ability checks
  if (data.stats) {
    for (const [key, name] of Object.entries(FIFTH_EDITION_ABILITY_NAMES)) {
      const mod = data.stats[key as keyof FifthEditionStats]?.modifier ?? 0;
      const expr = `1d20${fmt(mod)}`;
      abilities.push({
        label:             `${name.slice(0, 3).toUpperCase()} ${fmt(mod)}`,
        expression:        expr,
        purpose:           `${name} Check`,
        supportsAdvantage: true,
      });
    }
  }

  // Saving throws
  if (data.savingThrows) {
    for (const [key, name] of Object.entries(FIFTH_EDITION_ABILITY_NAMES)) {
      const save = data.savingThrows[key as keyof FifthEditionSavingThrows];
      if (!save) continue;
      // The scores plus the other bonus; a sheet saved before the other bonus
      // existed rolls the total it stores, as it always has.
      const bonus = fifthEditionSaveBonus(data, key);
      const expr = `1d20${fmt(bonus)}`;
      saves.push({
        label:             `${name} Save ${fmt(bonus)}`,
        expression:        expr,
        purpose:           `${name} Saving Throw`,
        supportsAdvantage: true,
      });
    }
  }

  // Skills
  if (data.skills) {
    for (const [key, name] of Object.entries(FIFTH_EDITION_SKILL_NAMES)) {
      const skill = data.skills[key as keyof FifthEditionSkills];
      if (!skill) continue;
      const bonus = fifthEditionSkillBonus(data, key);
      const expr = `1d20${fmt(bonus)}`;
      skills.push({
        label:             `${name} ${fmt(bonus)}`,
        expression:        expr,
        purpose:           `${name} Check`,
        supportsAdvantage: true,
      });
    }
  }

  // Skills of the player's own — tool proficiencies and anything homebrew.
  // The bonus is derived from the sheet rather than stored, so it follows the
  // character's ability scores and level without being re-entered.
  for (const custom of readCustomSkills(data)) {
    const bonus = fifthEditionCustomSkillBonus(data, custom);
    skills.push({
      label:             `${custom.name} ${fmt(bonus)}`,
      expression:        `1d20${fmt(bonus)}`,
      purpose:           `${custom.name} Check`,
      supportsAdvantage: true,
    });
  }

  // Attacks / weapons
  if (Array.isArray(data.attacks)) {
    for (const atk of data.attacks) {
      if (!atk.name) continue;
      // Attack roll
      const atkBonus = atk.attackBonus ?? 0;
      const atkExpr = `1d20${fmt(atkBonus)}`;
      combat.push({
        label:             `${atk.name} (Attack ${fmt(atkBonus)})`,
        expression:        atkExpr,
        purpose:           attackPurpose(atk.name),
        supportsAdvantage: true,
      });
      // Damage roll — only if the field is a valid dice expression
      if (atk.damageRoll && isValidDiceExpression(atk.damageRoll)) {
        combat.push({
          label:             `${atk.name} (Damage ${atk.damageRoll})`,
          expression:        atk.damageRoll,
          purpose:           damagePurpose(atk.name),
          supportsAdvantage: false,
        });
      }

      // Further damage lines — a versatile weapon's two-handed die, a spell's
      // higher-level damage. The sheet makes these rollable; the picker has to
      // as well, or a spear is one-handed everywhere except the sheet itself.
      for (const extra of atk.additionalDamage ?? []) {
        const roll = extra.damageRoll?.trim();
        if (!roll || !isValidDiceExpression(roll)) continue;
        const label = extra.label?.trim() || 'Alternate';
        combat.push({
          label:             `${atk.name} — ${label} (${roll})`,
          expression:        roll,
          purpose:           damagePurpose(atk.name, label),
          supportsAdvantage: false,
        });
      }
    }
  }

  // Hit dice — spending one on a short rest.
  //
  // `total` is the pool ("5d10" is five d10), so the stored string is not the
  // roll: one die plus Constitution is. An entry with nothing left, or a total
  // that is not a die, offers nothing rather than a roll that cannot be made.
  const hitDice: RollOption[] = [];
  if (Array.isArray(data.hitDice)) {
    const con = data.stats?.constitution?.modifier ?? 0;
    data.hitDice.forEach((hd, index) => {
      if (!canSpendHitDie(hd, con)) return;
      const die = hitDieExpression(hd, con);
      if (die === null) return;
      const max = hitDiceMaximum(hd);
      const left = max === null ? `${hd.remaining} left` : `${hd.remaining}/${max}`;
      hitDice.push({
        label:             `${hd.class ? `${hd.class} ` : ''}${die} (${left})`,
        expression:        spendRoll(die, con),
        purpose:           `Spend a Hit Die${hd.class ? ` (${hd.class})` : ''}`,
        supportsAdvantage: false,
        hitDiceIndex:      index,
      });
    });
  }

  return { abilities, skills, savingThrows: saves, combat, hitDice };
}

// ---------------------------------------------------------------------------
// Fantasy d20
// ---------------------------------------------------------------------------

const FANTASY_D20_ABILITY_NAMES: Record<string, string> = {
  strength:     'Strength',
  dexterity:    'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom:       'Wisdom',
  charisma:     'Charisma',
};

const FANTASY_D20_SAVE_NAMES: Record<string, string> = {
  fortitude: 'Fortitude',
  reflex:    'Reflex',
  will:      'Will',
};

const FANTASY_D20_SKILL_NAMES: Record<string, string> = {
  acrobatics:     'Acrobatics',
  arcana:         'Arcana',
  athletics:      'Athletics',
  crafting:       'Crafting',
  deception:      'Deception',
  diplomacy:      'Diplomacy',
  intimidation:   'Intimidation',
  medicine:       'Medicine',
  nature:         'Nature',
  occultism:      'Occultism',
  performance:    'Performance',
  religion:       'Religion',
  society:        'Society',
  stealth:        'Stealth',
  survival:       'Survival',
  thievery:       'Thievery',
};

/**
 * A lore skill's name as rolled: "Sailing" as "Sailing Lore", and a name that
 * already ends in Lore, as the rules write them ("Warfare Lore"), as it is.
 */
export function fantasyD20LoreName(name: string): string {
  return /\blore$/i.test(name.trim()) ? name.trim() : `${name.trim()} Lore`;
}

function extractFantasyD20Rolls(data: FantasyD20CharacterData): CharacterRolls {
  const abilities: RollOption[] = [];
  const skills:    RollOption[] = [];
  const saves:     RollOption[] = [];
  const combat:    RollOption[] = [];

  // Ability checks
  if (data.attributes) {
    for (const [key, name] of Object.entries(FANTASY_D20_ABILITY_NAMES)) {
      const mod = data.attributes[key as keyof FantasyD20Attributes]?.modifier ?? 0;
      const expr = `1d20${fmt(mod)}`;
      abilities.push({
        label:             `${name.slice(0, 3).toUpperCase()} ${fmt(mod)}`,
        expression:        expr,
        purpose:           `${name} Check`,
        supportsAdvantage: true, // Fantasy d20 Fortune/Misfortune ≈ Adv/Dis
      });
    }
  }

  // Saving throws
  if (data.savingThrows) {
    for (const [key, name] of Object.entries(FANTASY_D20_SAVE_NAMES)) {
      const save = data.savingThrows[key as keyof FantasyD20SavingThrows];
      if (!save) continue;
      // Worked out from the parts, as the sheet shows them.
      const bonus = fantasyD20SaveTotal(data, key as keyof FantasyD20SavingThrows);
      const expr = `1d20${fmt(bonus)}`;
      saves.push({
        label:             `${name} ${fmt(bonus)}`,
        expression:        expr,
        purpose:           `${name} Save`,
        supportsAdvantage: true,
      });
    }
  }

  // Perception
  if (data.perception) {
    const bonus = fantasyD20PerceptionTotal(data);
    saves.push({
      label:             `Perception ${fmt(bonus)}`,
      expression:        `1d20${fmt(bonus)}`,
      purpose:           'Perception Check',
      supportsAdvantage: true,
    });
  }

  // Skills
  if (data.skills) {
    for (const [key, name] of Object.entries(FANTASY_D20_SKILL_NAMES)) {
      const skill = data.skills[key as keyof FantasyD20Skills];
      if (!skill) continue;
      const total = fantasyD20SkillTotal(data, skill);
      const expr = `1d20${fmt(total)}`;
      skills.push({
        label:             `${name} ${fmt(total)}`,
        expression:        expr,
        purpose:           `${name} Check`,
        supportsAdvantage: true,
      });
    }
  }

  // Lore skills, which the sheet keeps beside `skills` rather than inside it.
  if (Array.isArray(data.loreSkills)) {
    for (const lore of data.loreSkills) {
      if (!lore.name) continue;
      const total = fantasyD20SkillTotal(data, lore);
      skills.push({
        label:             `${fantasyD20LoreName(lore.name)} ${fmt(total)}`,
        expression:        `1d20${fmt(total)}`,
        purpose:           `${fantasyD20LoreName(lore.name)} Check`,
        supportsAdvantage: true,
      });
    }
  }

  // Strikes
  if (Array.isArray(data.strikes)) {
    for (const strike of data.strikes) {
      if (!strike.name) continue;
      // Only show attack if attackBonus is a number
      if (strike.attackBonus !== null && typeof strike.attackBonus === 'number') {
        const bonus = strike.attackBonus;
        combat.push({
          label:             `${strike.name} Strike ${fmt(bonus)}`,
          expression:        `1d20${fmt(bonus)}`,
          purpose:           strikePurpose(strike.name),
          supportsAdvantage: true,
        });
      }
      if (strike.damageRoll && isValidDiceExpression(strike.damageRoll)) {
        combat.push({
          label:             `${strike.name} Damage (${strike.damageRoll})`,
          expression:        strike.damageRoll,
          purpose:           damagePurpose(strike.name),
          supportsAdvantage: false,
        });
      }
    }
  }

  return { abilities, skills, savingThrows: saves, combat, hitDice: [] };
}

// ---------------------------------------------------------------------------
// Horror d100
// ---------------------------------------------------------------------------

/** The characteristics that give a roll, in the order the sheet shows them. */
const HORROR_D100_ROLLED_CHARACTERISTICS = ['STR', 'CON', 'INT', 'POW', 'DEX', 'CHA', 'EDU'] as const;

function extractHorrorD100Rolls(data: HorrorD100Sheet): CharacterRolls {
  const abilities: RollOption[] = [];   // characteristic rolls
  const skills:    RollOption[] = [];
  const saves:     RollOption[] = [];   // (empty for Horror d100)
  const combat:    RollOption[] = [];

  // Each characteristic's roll, at five times the characteristic: Effort for
  // STR, Luck for POW and the rest. SIZ gives none, and EDU only where the
  // sheet uses it.
  const characteristics: Record<string, unknown> = { ...data.characteristics };
  for (const key of HORROR_D100_ROLLED_CHARACTERISTICS) {
    const value = characteristics[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const name = HORROR_D100_CHARACTERISTIC_ROLLS[key];
    const target = horrorD100CharacteristicRoll(value);
    abilities.push({
      label:             `${name} (${key}×5, target: ${target}%)`,
      expression:        '1d100',
      purpose:           `${name} (${key}×5) — target: ${target}%`,
      supportsAdvantage: false,
    });
  }

  // Skills, named and ordered as the sheet lists them.
  for (const { name, value } of horrorD100NamedSkills(data.skills)) {
    skills.push({
      label:             `${name} — target: ${value}%`,
      expression:        '1d100',
      purpose:           `${name} — target: ${value}%`,
      supportsAdvantage: false,
    });
  }

  // Weapons
  if (Array.isArray(data.weapons)) {
    const str = characteristics.STR;
    const siz = characteristics.SIZ;
    // Worked out from STR and SIZ; the sheet does not store it.
    const damageModifier = typeof str === 'number' && typeof siz === 'number' ? horrorD100DamageModifier(str, siz) : 'None';
    for (const w of data.weapons) {
      if (!w.name) continue;
      // Skill check to hit, at the value of the skill the weapon names, or
      // the weapon's own where the sheet has no such skill. A weapon with
      // neither has nothing to roll at, on the sheet as here.
      const target = horrorD100WeaponSkillRating(data.skills, w.skill ?? '', typeof w.skillValue === 'number' ? w.skillValue : Number.NaN);
      if (!Number.isNaN(target)) {
        combat.push({
          label:             `${w.name} (${w.skill || 'Skill'}, target: ${target}%)`,
          expression:        '1d100',
          purpose:           `${w.name} Attack — ${w.skill || 'Skill'} target: ${target}%`,
          supportsAdvantage: false,
        });
      }
      // Damage roll, with the damage modifier where it says so.
      const damage = w.damage ? horrorD100DamageWithModifier(w.damage, damageModifier) : '';
      if (damage && isValidDiceExpression(damage)) {
        combat.push({
          label:             `${w.name} Damage (${damage})`,
          expression:        damage,
          purpose:           damagePurpose(w.name),
          supportsAdvantage: false,
        });
      }
    }
  }

  return { abilities, skills, savingThrows: saves, combat, hitDice: [] };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Initiative used to be worked out here, in a `getInitiativeExpression` that
// nothing called and that was wrong on every branch: it read
// `data.combatStats.initiative` for both 5E and Fantasy d20, which neither
// system stores, and invented a `1d10 + DEX/5` roll for Horror d100, which
// has no initiative roll at all. It now lives in utils/rules/initiative.ts,
// duplicated to the backend so the server can decide what is actually rolled.

/**
 * Extract all rollable options from a character's data.
 *
 * @param gameSystem  The character's game system string (e.g. "FIFTH_EDITION")
 * @param data        The raw `character.data` JSON object
 * @returns           Structured roll options grouped by category
 */
export function getCharacterRolls(gameSystem: string | null, data: CharacterData | null | undefined): CharacterRolls {
  if (!data) return { abilities: [], skills: [], savingThrows: [], combat: [], hitDice: [] };

  // The system decides which shape `data` is in, which is exactly what the
  // switch below is establishing — so each branch asserts the one it selected.
  switch (gameSystem) {
    case 'FIFTH_EDITION':
      return extractFifthEditionRolls(data as FifthEditionCharacterData);
    case 'FANTASY_D20':
      return extractFantasyD20Rolls(data as FantasyD20CharacterData);
    case 'HORROR_D100':
      return extractHorrorD100Rolls(data as HorrorD100Sheet);
    default:
      return { abilities: [], skills: [], savingThrows: [], combat: [], hitDice: [] };
  }
}
