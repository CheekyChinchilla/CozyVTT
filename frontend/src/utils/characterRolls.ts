import type { CharacterData } from '@/types';
import { readCustomSkills, dnd5eCustomSkillBonus } from '@/utils/rules/dnd5e';
import type {
  DnD5eCharacterData,
  DnD5eStats,
  DnD5eSkills,
  DnD5eSavingThrows,
  PF2eCharacterData,
  PF2eAttributes,
  PF2eSavingThrows,
  PF2eSkills,
  CoC7eCharacterData,
  CoC7eCharacteristics,
} from '@/types/game-systems';

/**
 * A skill entry as this file probes it.
 *
 * The Call of Cthulhu skills object mixes shapes: most entries are a skill,
 * `fighting` and `firearms` hold a group of them, and two hold arrays. Rather
 * than discriminate, the extractor checks for `currentValue` and skips what
 * does not have one — so what it needs is a shape that says "this may or may
 * not be a leaf".
 */
interface CoC7eSkillLike {
  currentValue?: number;
  name?: string;
  /** `fighting` holds a group rather than a leaf; the extractor checks for it. */
  brawl?: { currentValue?: number };
}
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
   * true for d20-based systems (D&D 5e, PF2e): the caller may substitute
   * "2d20kh1" (advantage) or "2d20kl1" (disadvantage) in place of "1d20".
   */
  supportsAdvantage: boolean;
}

export interface CharacterRolls {
  abilities:     RollOption[];   // Ability score / characteristic checks
  skills:        RollOption[];   // Skill checks
  savingThrows:  RollOption[];   // Saving throws / resistance rolls
  combat:        RollOption[];   // Attack rolls and damage rolls
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function fmt(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/** Returns true if the string looks like a valid dice expression the server can evaluate. */
export function isValidDiceExpression(expr: string): boolean {
  if (!expr || !expr.trim()) return false;
  return /^[\dd+\-*/khldisavw\s]+$/i.test(expr.trim());
}

/**
 * Converts a normal-roll expression beginning with "1d20" to an advantage
 * expression by replacing "1d20" with "2d20kh1".
 */
export function withAdvantage(expr: string): string {
  return expr.replace(/^1d20/, '2d20kh1');
}

/**
 * Converts a normal-roll expression beginning with "1d20" to a disadvantage
 * expression by replacing "1d20" with "2d20kl1".
 */
export function withDisadvantage(expr: string): string {
  return expr.replace(/^1d20/, '2d20kl1');
}

// ---------------------------------------------------------------------------
// D&D 5e
// ---------------------------------------------------------------------------

const DND5E_ABILITY_NAMES: Record<string, string> = {
  strength:     'Strength',
  dexterity:    'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom:       'Wisdom',
  charisma:     'Charisma',
};

const DND5E_SKILL_NAMES: Record<string, string> = {
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

function extractDnd5eRolls(data: DnD5eCharacterData): CharacterRolls {
  const abilities: RollOption[] = [];
  const skills:    RollOption[] = [];
  const saves:     RollOption[] = [];
  const combat:    RollOption[] = [];

  // Ability checks
  if (data.stats) {
    for (const [key, name] of Object.entries(DND5E_ABILITY_NAMES)) {
      const mod = data.stats[key as keyof DnD5eStats]?.modifier ?? 0;
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
    for (const [key, name] of Object.entries(DND5E_ABILITY_NAMES)) {
      const save = data.savingThrows[key as keyof DnD5eSavingThrows];
      if (!save) continue;
      const bonus = save.bonus ?? 0;
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
    for (const [key, name] of Object.entries(DND5E_SKILL_NAMES)) {
      const skill = data.skills[key as keyof DnD5eSkills];
      if (!skill) continue;
      const bonus = skill.bonus ?? 0;
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
    const bonus = dnd5eCustomSkillBonus(data, custom);
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
        purpose:           `${atk.name} Attack`,
        supportsAdvantage: true,
      });
      // Damage roll — only if the field is a valid dice expression
      if (atk.damageRoll && isValidDiceExpression(atk.damageRoll)) {
        combat.push({
          label:             `${atk.name} (Damage ${atk.damageRoll})`,
          expression:        atk.damageRoll,
          purpose:           `${atk.name} Damage`,
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
          purpose:           `${atk.name} Damage (${label})`,
          supportsAdvantage: false,
        });
      }
    }
  }

  return { abilities, skills, savingThrows: saves, combat };
}

// ---------------------------------------------------------------------------
// Pathfinder 2e
// ---------------------------------------------------------------------------

const PF2E_ABILITY_NAMES: Record<string, string> = {
  strength:     'Strength',
  dexterity:    'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom:       'Wisdom',
  charisma:     'Charisma',
};

const PF2E_SAVE_NAMES: Record<string, string> = {
  fortitude: 'Fortitude',
  reflex:    'Reflex',
  will:      'Will',
};

const PF2E_SKILL_NAMES: Record<string, string> = {
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

function extractPf2eRolls(data: PF2eCharacterData): CharacterRolls {
  const abilities: RollOption[] = [];
  const skills:    RollOption[] = [];
  const saves:     RollOption[] = [];
  const combat:    RollOption[] = [];

  // Ability checks
  if (data.attributes) {
    for (const [key, name] of Object.entries(PF2E_ABILITY_NAMES)) {
      const mod = data.attributes[key as keyof PF2eAttributes]?.modifier ?? 0;
      const expr = `1d20${fmt(mod)}`;
      abilities.push({
        label:             `${name.slice(0, 3).toUpperCase()} ${fmt(mod)}`,
        expression:        expr,
        purpose:           `${name} Check`,
        supportsAdvantage: true, // PF2e Fortune/Misfortune ≈ Adv/Dis
      });
    }
  }

  // Saving throws
  if (data.savingThrows) {
    for (const [key, name] of Object.entries(PF2E_SAVE_NAMES)) {
      const save = data.savingThrows[key as keyof PF2eSavingThrows];
      if (!save) continue;
      const bonus = save.bonus ?? 0;
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
    const bonus = data.perception.bonus ?? 0;
    saves.push({
      label:             `Perception ${fmt(bonus)}`,
      expression:        `1d20${fmt(bonus)}`,
      purpose:           'Perception Check',
      supportsAdvantage: true,
    });
  }

  // Skills
  if (data.skills) {
    for (const [key, name] of Object.entries(PF2E_SKILL_NAMES)) {
      const skill = data.skills[key as keyof PF2eSkills];
      if (!skill) continue;
      const total = skill.bonus ?? 0;
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
      const total = lore.bonus ?? 0;
      skills.push({
        label:             `${lore.name} Lore ${fmt(total)}`,
        expression:        `1d20${fmt(total)}`,
        purpose:           `${lore.name} Lore Check`,
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
          purpose:           `${strike.name} Strike`,
          supportsAdvantage: true,
        });
      }
      if (strike.damageRoll && isValidDiceExpression(strike.damageRoll)) {
        combat.push({
          label:             `${strike.name} Damage (${strike.damageRoll})`,
          expression:        strike.damageRoll,
          purpose:           `${strike.name} Damage`,
          supportsAdvantage: false,
        });
      }
    }
  }

  return { abilities, skills, savingThrows: saves, combat };
}

// ---------------------------------------------------------------------------
// Call of Cthulhu 7e
// ---------------------------------------------------------------------------

// Keyed by what a sheet actually stores. These were lowercase, which is half
// of why characteristic rolls never appeared: `characteristics.str` is
// undefined when the sheet holds `characteristics.STR`.
const COC_CHARACTERISTIC_NAMES: Record<keyof CoC7eCharacteristics, string> = {
  STR: 'STR',
  CON: 'CON',
  SIZ: 'SIZ',
  DEX: 'DEX',
  APP: 'APP',
  INT: 'INT',
  POW: 'POW',
  EDU: 'EDU',
};

const COC_SKILL_DISPLAY: Record<string, string> = {
  accounting:            'Accounting',
  anthropology:          'Anthropology',
  appraise:              'Appraise',
  archaeology:           'Archaeology',
  artCraft:              'Art/Craft',
  charm:                 'Charm',
  climb:                 'Climb',
  creditRating:          'Credit Rating',
  cthulhuMythos:         'Cthulhu Mythos',
  disguise:              'Disguise',
  dodge:                 'Dodge',
  driveAuto:             'Drive Auto',
  electricalRepair:      'Electrical Repair',
  fastTalk:              'Fast Talk',
  fighting:              'Fighting',
  firearms:              'Firearms',
  firstAid:              'First Aid',
  history:               'History',
  intimidate:            'Intimidate',
  jump:                  'Jump',
  languageOwn:           'Language (Own)',
  languageOther:         'Language (Other)',
  law:                   'Law',
  libraryUse:            'Library Use',
  listen:                'Listen',
  locksmith:             'Locksmith',
  mechanicalRepair:      'Mechanical Repair',
  medicine:              'Medicine',
  naturalWorld:          'Natural World',
  navigate:              'Navigate',
  occult:                'Occult',
  operateHeavyMachinery: 'Operate Heavy Machinery',
  persuade:              'Persuade',
  pilot:                 'Pilot',
  psychoanalysis:        'Psychoanalysis',
  psychology:            'Psychology',
  ride:                  'Ride',
  science:               'Science',
  sleightOfHand:         'Sleight of Hand',
  spotHidden:            'Spot Hidden',
  stealth:               'Stealth',
  survival:              'Survival',
  swim:                  'Swim',
  throw:                 'Throw',
  track:                 'Track',
};

function extractCocRolls(data: CoC7eCharacterData): CharacterRolls {
  const abilities: RollOption[] = [];   // characteristics
  const skills:    RollOption[] = [];
  const saves:     RollOption[] = [];   // (empty for CoC)
  const combat:    RollOption[] = [];

  // Characteristics
  if (data.characteristics) {
    for (const [key, label] of Object.entries(COC_CHARACTERISTIC_NAMES) as [keyof CoC7eCharacteristics, string][]) {
      const val = data.characteristics[key]?.regular;
      if (typeof val !== 'number') continue;
      abilities.push({
        label:             `${label} (target: ${val}%)`,
        expression:        '1d100',
        purpose:           `${label} Check (target: ${val}%)`,
        supportsAdvantage: false,
      });
    }
  }

  // Skills
  if (data.skills && typeof data.skills === 'object') {
    for (const [key, skill] of Object.entries(data.skills as unknown as Record<string, CoC7eSkillLike>)) {
      if (key === 'customSkills') continue;

      // Handle specializations (fighting, firearms, languageOther, science)
      if (key === 'fighting' && skill?.brawl) {
        const val = skill.brawl.currentValue;
        if (typeof val === 'number') {
          skills.push({
            label:             `Fighting (Brawl) — target: ${val}%`,
            expression:        '1d100',
            purpose:           `Fighting (Brawl) — target: ${val}%`,
            supportsAdvantage: false,
          });
        }
        continue;
      }

      if (key === 'firearms' && typeof skill === 'object' && !('currentValue' in skill)) {
        for (const [sub, subSkill] of Object.entries(skill as Record<string, CoC7eSkillLike>)) {
          if (!subSkill?.currentValue) continue;
          const val = subSkill.currentValue as number;
          const subName = sub.charAt(0).toUpperCase() + sub.slice(1);
          skills.push({
            label:             `Firearms (${subName}) — target: ${val}%`,
            expression:        '1d100',
            purpose:           `Firearms (${subName}) — target: ${val}%`,
            supportsAdvantage: false,
          });
        }
        continue;
      }

      if (key === 'languageOther' && Array.isArray(skill)) {
        for (const lang of skill) {
          if (!lang?.currentValue) continue;
          const name = lang.language ? `Language (${lang.language})` : 'Language (Other)';
          skills.push({
            label:             `${name} — target: ${lang.currentValue}%`,
            expression:        '1d100',
            purpose:           `${name} — target: ${lang.currentValue}%`,
            supportsAdvantage: false,
          });
        }
        continue;
      }

      if (key === 'science' && Array.isArray(skill)) {
        for (const sci of skill) {
          if (!sci?.currentValue) continue;
          const name = sci.specialization ? `Science (${sci.specialization})` : 'Science';
          skills.push({
            label:             `${name} — target: ${sci.currentValue}%`,
            expression:        '1d100',
            purpose:           `${name} — target: ${sci.currentValue}%`,
            supportsAdvantage: false,
          });
        }
        continue;
      }

      // Standard skill
      if (skill && typeof skill === 'object' && 'currentValue' in skill) {
        const val = skill.currentValue as number;
        const name = COC_SKILL_DISPLAY[key] || key;
        skills.push({
          label:             `${name} — target: ${val}%`,
          expression:        '1d100',
          purpose:           `${name} — target: ${val}%`,
          supportsAdvantage: false,
        });
      }
    }

    // Custom skills
    if (Array.isArray(data.skills.customSkills)) {
      for (const cs of data.skills.customSkills) {
        // A custom skill carries its own label. Declared by neither the type
        // nor the schema, but it round-trips — see SkillsList for why.
        const named = cs as { name?: string; currentValue?: number };
        if (!named.name || typeof named.currentValue !== 'number') continue;
        skills.push({
          label:             `${named.name} — target: ${named.currentValue}%`,
          expression:        '1d100',
          purpose:           `${named.name} — target: ${named.currentValue}%`,
          supportsAdvantage: false,
        });
      }
    }
  }

  // Weapons, which the sheet keeps under `combat`.
  if (Array.isArray(data.combat?.weapons)) {
    for (const w of data.combat.weapons) {
      if (!w.name) continue;
      // Skill check to hit
      if (typeof w.skillValue === 'number') {
        combat.push({
          label:             `${w.name} (${w.skill || 'Skill'}, target: ${w.skillValue}%)`,
          expression:        '1d100',
          purpose:           `${w.name} Attack — ${w.skill || 'Skill'} target: ${w.skillValue}%`,
          supportsAdvantage: false,
        });
      }
      // Damage roll
      if (w.damage && isValidDiceExpression(w.damage)) {
        combat.push({
          label:             `${w.name} Damage (${w.damage})`,
          expression:        w.damage,
          purpose:           `${w.name} Damage`,
          supportsAdvantage: false,
        });
      }
    }
  }

  return { abilities, skills, savingThrows: saves, combat };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Initiative used to be worked out here, in a `getInitiativeExpression` that
// nothing called and that was wrong on every branch: it read
// `data.combatStats.initiative` for both D&D 5e and Pathfinder 2e, which neither
// system stores, and invented a `1d10 + DEX/5` roll for Call of Cthulhu, which
// has no initiative roll at all. It now lives in utils/rules/initiative.ts,
// duplicated to the backend so the server can decide what is actually rolled.

/**
 * Extract all rollable options from a character's data.
 *
 * @param gameSystem  The character's game system string (e.g. "DND_5E")
 * @param data        The raw `character.data` JSON object
 * @returns           Structured roll options grouped by category
 */
export function getCharacterRolls(gameSystem: string | null, data: CharacterData | null | undefined): CharacterRolls {
  if (!data) return { abilities: [], skills: [], savingThrows: [], combat: [] };

  // The system decides which shape `data` is in, which is exactly what the
  // switch below is establishing — so each branch asserts the one it selected.
  switch (gameSystem) {
    case 'DND_5E':
      return extractDnd5eRolls(data as DnD5eCharacterData);
    case 'PATHFINDER_2E':
      return extractPf2eRolls(data as PF2eCharacterData);
    case 'CALL_OF_CTHULHU_7E':
      return extractCocRolls(data as CoC7eCharacterData);
    default:
      return { abilities: [], skills: [], savingThrows: [], combat: [] };
  }
}
