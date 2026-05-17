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

function extractDnd5eRolls(data: any): CharacterRolls {
  const abilities: RollOption[] = [];
  const skills:    RollOption[] = [];
  const saves:     RollOption[] = [];
  const combat:    RollOption[] = [];

  // Ability checks
  if (data.stats) {
    for (const [key, name] of Object.entries(DND5E_ABILITY_NAMES)) {
      const mod = data.stats[key]?.modifier ?? 0;
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
      const save = data.savingThrows[key];
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
      const skill = data.skills[key];
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

function extractPf2eRolls(data: any): CharacterRolls {
  const abilities: RollOption[] = [];
  const skills:    RollOption[] = [];
  const saves:     RollOption[] = [];
  const combat:    RollOption[] = [];

  // Ability checks
  if (data.attributes) {
    for (const [key, name] of Object.entries(PF2E_ABILITY_NAMES)) {
      const mod = data.attributes[key]?.modifier ?? 0;
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
      const save = data.savingThrows[key];
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
      const skill = data.skills[key];
      if (!skill) continue;
      const total = skill.total ?? 0;
      const expr = `1d20${fmt(total)}`;
      skills.push({
        label:             `${name} ${fmt(total)}`,
        expression:        expr,
        purpose:           `${name} Check`,
        supportsAdvantage: true,
      });
    }
    // Lore skills (dynamic)
    if (Array.isArray(data.skills.loreSkills)) {
      for (const lore of data.skills.loreSkills) {
        if (!lore.name) continue;
        const total = lore.total ?? 0;
        skills.push({
          label:             `${lore.name} Lore ${fmt(total)}`,
          expression:        `1d20${fmt(total)}`,
          purpose:           `${lore.name} Lore Check`,
          supportsAdvantage: true,
        });
      }
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

const COC_CHARACTERISTIC_NAMES: Record<string, string> = {
  str: 'STR',
  con: 'CON',
  siz: 'SIZ',
  dex: 'DEX',
  app: 'APP',
  int: 'INT',
  pow: 'POW',
  edu: 'EDU',
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

function extractCocRolls(data: any): CharacterRolls {
  const abilities: RollOption[] = [];   // characteristics
  const skills:    RollOption[] = [];
  const saves:     RollOption[] = [];   // (empty for CoC)
  const combat:    RollOption[] = [];

  // Characteristics
  if (data.characteristics) {
    for (const [key, label] of Object.entries(COC_CHARACTERISTIC_NAMES)) {
      const val = data.characteristics[key]?.value;
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
    for (const [key, skill] of Object.entries(data.skills as Record<string, any>)) {
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
        for (const [sub, subSkill] of Object.entries(skill as Record<string, any>)) {
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
        if (!cs?.name || typeof cs.currentValue !== 'number') continue;
        skills.push({
          label:             `${cs.name} — target: ${cs.currentValue}%`,
          expression:        '1d100',
          purpose:           `${cs.name} — target: ${cs.currentValue}%`,
          supportsAdvantage: false,
        });
      }
    }
  }

  // Weapons
  if (Array.isArray(data.weapons)) {
    for (const w of data.weapons) {
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

// ---------------------------------------------------------------------------
// Initiative expression helpers
// ---------------------------------------------------------------------------

/**
 * Returns a dice expression suitable for an initiative roll for the given
 * game system and character data, or null if the system cannot be determined.
 *
 * D&D 5e   → 1d20 + initiative modifier (stored in combatStats.initiative)
 * PF2e     → 1d20 + perception bonus (most common default) or initiative.bonus
 * CoC 7e   → 1d10 + floor(DEX / 5)
 * Others   → null (caller should prompt for manual entry)
 */
export function getInitiativeExpression(gameSystem: string | null, data: any): string | null {
  if (!data) return null;

  switch (gameSystem) {
    case 'DND_5E': {
      const mod = data?.combatStats?.initiative ?? 0;
      return `1d20${fmt(mod)}`;
    }
    case 'PATHFINDER_2E': {
      // PF2e defaults to Perception for initiative, fall back to initiative.bonus
      const perceptionBonus = data?.perception?.bonus ?? 0;
      const initiativeBonus = data?.combatStats?.initiative?.bonus ?? 0;
      const bonus = perceptionBonus !== 0 ? perceptionBonus : initiativeBonus;
      return `1d20${fmt(bonus)}`;
    }
    case 'CALL_OF_CTHULHU_7E': {
      const dex = data?.characteristics?.dex?.regular ?? data?.characteristics?.DEX?.regular ?? 0;
      const dexMod = Math.floor(dex / 5);
      return `1d10${fmt(dexMod)}`;
    }
    default:
      return null;
  }
}

/**
 * Extract all rollable options from a character's data.
 *
 * @param gameSystem  The character's game system string (e.g. "DND_5E")
 * @param data        The raw `character.data` JSON object
 * @returns           Structured roll options grouped by category
 */
export function getCharacterRolls(gameSystem: string | null, data: any): CharacterRolls {
  if (!data) return { abilities: [], skills: [], savingThrows: [], combat: [] };

  switch (gameSystem) {
    case 'DND_5E':
      return extractDnd5eRolls(data);
    case 'PATHFINDER_2E':
      return extractPf2eRolls(data);
    case 'CALL_OF_CTHULHU_7E':
      return extractCocRolls(data);
    default:
      return { abilities: [], skills: [], savingThrows: [], combat: [] };
  }
}
