/**
 * Game Systems Validation Index
 * Exports validation schemas and helper functions
 */

import { z } from 'zod';
import { GameSystem } from '../../game-systems';
import {
  dnd5eCharacterDataSchema,
  type DnD5eCharacterData,
} from './dnd5e.schema';
import {
  pathfinder2eCharacterDataSchema,
  type PF2eCharacterData,
} from './pathfinder2e.schema';
import {
  shadowrun6eCharacterDataSchema,
  type SR6CharacterData,
} from './shadowrun6e.schema';
import {
  callOfCthulhu7eCharacterDataSchema,
  type CoC7eCharacterData,
} from './callOfCthulhu7e.schema';

// Re-export schemas
export {
  dnd5eCharacterDataSchema,
  pathfinder2eCharacterDataSchema,
  shadowrun6eCharacterDataSchema,
  callOfCthulhu7eCharacterDataSchema,
};

// Re-export types
export type {
  DnD5eCharacterData,
  PF2eCharacterData,
  SR6CharacterData,
  CoC7eCharacterData,
};

/**
 * Validation result type
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: z.ZodError };

/**
 * Validate character data for a specific game system
 * @param gameSystem - The game system to validate against
 * @param data - The character data to validate
 * @returns Validation result with typed data or errors
 */
export function validateCharacterData(
  gameSystem: GameSystem,
  data: unknown
): ValidationResult<
  | DnD5eCharacterData
  | PF2eCharacterData
  | SR6CharacterData
  | CoC7eCharacterData
> {
  try {
    switch (gameSystem) {
      case GameSystem.DND_5E: {
        const validated = dnd5eCharacterDataSchema.parse(data);
        return { success: true, data: validated };
      }
      case GameSystem.PATHFINDER_2E: {
        const validated = pathfinder2eCharacterDataSchema.parse(data);
        return { success: true, data: validated };
      }
      case GameSystem.SHADOWRUN_6E: {
        const validated = shadowrun6eCharacterDataSchema.parse(data);
        return { success: true, data: validated };
      }
      case GameSystem.CALL_OF_CTHULHU_7E: {
        const validated = callOfCthulhu7eCharacterDataSchema.parse(data);
        return { success: true, data: validated };
      }
      default: {
        // TypeScript should prevent this, but handle it anyway
        const error = new z.ZodError([
          {
            code: 'custom',
            message: `Unknown game system: ${gameSystem}`,
            path: ['gameSystem'],
          },
        ]);
        return { success: false, errors: error };
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: error };
    }
    // Re-throw unexpected errors
    throw error;
  }
}

/**
 * Get a blank character template for a specific game system
 * Returns minimal valid character data that can be used as a starting point
 * @param gameSystem - The game system to create a template for
 * @returns Minimal valid character data
 */
export function getBlankCharacterTemplate(
  gameSystem: GameSystem
):
  | DnD5eCharacterData
  | PF2eCharacterData
  | SR6CharacterData
  | CoC7eCharacterData {
  switch (gameSystem) {
    case GameSystem.DND_5E:
      return createBlankDnD5eCharacter();
    case GameSystem.PATHFINDER_2E:
      return createBlankPF2eCharacter();
    case GameSystem.SHADOWRUN_6E:
      return createBlankSR6Character();
    case GameSystem.CALL_OF_CTHULHU_7E:
      return createBlankCoC7eCharacter();
  }
}

/**
 * Create blank D&D 5e character
 */
function createBlankDnD5eCharacter(): DnD5eCharacterData {
  const baseAbility = { score: 10, modifier: 0 };
  const baseSave = { proficient: false, bonus: 0 };
  const baseSkill = { proficient: false, expertise: false, bonus: 0 };

  return {
    characterName: 'New Character',
    playerName: 'Player',
    class: 'Fighter',
    level: 1,
    background: 'Soldier',
    race: 'Human',
    alignment: 'Neutral',
    experiencePoints: 0,
    inspiration: false,
    proficiencyBonus: 2,
    stats: {
      strength: baseAbility,
      dexterity: baseAbility,
      constitution: baseAbility,
      intelligence: baseAbility,
      wisdom: baseAbility,
      charisma: baseAbility,
    },
    savingThrows: {
      strength: baseSave,
      dexterity: baseSave,
      constitution: baseSave,
      intelligence: baseSave,
      wisdom: baseSave,
      charisma: baseSave,
    },
    skills: {
      acrobatics: baseSkill,
      animalHandling: baseSkill,
      arcana: baseSkill,
      athletics: baseSkill,
      deception: baseSkill,
      history: baseSkill,
      insight: baseSkill,
      intimidation: baseSkill,
      investigation: baseSkill,
      medicine: baseSkill,
      nature: baseSkill,
      perception: baseSkill,
      performance: baseSkill,
      persuasion: baseSkill,
      religion: baseSkill,
      sleightOfHand: baseSkill,
      stealth: baseSkill,
      survival: baseSkill,
    },
    passivePerception: 10,
    armorClass: 10,
    initiative: 0,
    speed: 30,
    hp: { maximum: 10, current: 10, temporary: 0 },
    conditions: [],
    hitDice: [{ class: 'fighter', total: '1d10', remaining: 1 }],
    deathSaves: { successes: 0, failures: 0 },
    attacks: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    inventory: [],
    proficienciesAndLanguages: ['Common'],
    featuresAndTraits: [],
    appearance: {
      age: '25',
      height: '6\'0"',
      weight: '180 lbs',
      eyes: 'Brown',
      skin: 'Fair',
      hair: 'Black',
    },
    personality: {
      traits: '',
      ideals: '',
      bonds: '',
      flaws: '',
    },
    backstory: '',
    alliesAndOrganizations: { name: '', description: '' },
    treasure: '',
    additionalFeaturesAndTraits: '',
  };
}

/**
 * Create blank Pathfinder 2e character
 */
function createBlankPF2eCharacter(): PF2eCharacterData {
  const baseAbility = { score: 10, modifier: 0 };
  const baseSave = { proficiencyRank: 'trained' as const, itemBonus: 0, bonus: 3 };
  const baseSkill = {
    attribute: 'strength',
    proficiencyRank: 'untrained' as const,
    armorPenalty: 0,
    itemBonus: 0,
    bonus: 0,
  };

  return {
    characterName: 'New Character',
    playerName: 'Player',
    class: 'Fighter',
    level: 1,
    ancestry: 'Human',
    heritage: 'Versatile Human',
    background: 'Warrior',
    alignment: 'Neutral',
    deity: 'None',
    experiencePoints: 0,
    heroPoints: 1,
    attributes: {
      strength: baseAbility,
      dexterity: baseAbility,
      constitution: baseAbility,
      intelligence: baseAbility,
      wisdom: baseAbility,
      charisma: baseAbility,
    },
    savingThrows: {
      fortitude: baseSave,
      reflex: baseSave,
      will: baseSave,
    },
    perception: {
      proficiencyRank: 'trained',
      itemBonus: 0,
      bonus: 3,
      senses: [],
    },
    skills: {
      acrobatics: baseSkill,
      arcana: { ...baseSkill, attribute: 'intelligence' },
      athletics: baseSkill,
      crafting: { ...baseSkill, attribute: 'intelligence' },
      deception: { ...baseSkill, attribute: 'charisma' },
      diplomacy: { ...baseSkill, attribute: 'charisma' },
      intimidation: { ...baseSkill, attribute: 'charisma' },
      medicine: { ...baseSkill, attribute: 'wisdom' },
      nature: { ...baseSkill, attribute: 'wisdom' },
      occultism: { ...baseSkill, attribute: 'intelligence' },
      performance: { ...baseSkill, attribute: 'charisma' },
      religion: { ...baseSkill, attribute: 'wisdom' },
      society: { ...baseSkill, attribute: 'intelligence' },
      stealth: { ...baseSkill, attribute: 'dexterity' },
      survival: { ...baseSkill, attribute: 'wisdom' },
      thievery: { ...baseSkill, attribute: 'dexterity' },
    },
    loreSkills: [],
    armorClass: {
      total: 13,
      proficiencyRank: 'trained',
      capDex: null,
      itemBonus: 0,
      armorPenalty: 0,
    },
    classDC: { total: 13, keyAttribute: 'strength', proficiencyRank: 'trained' },
    initiative: { usedStat: 'perception', bonus: 3 },
    speed: { land: 25, other: [] },
    hp: {
      maximum: 16,
      ancestryHp: 8,
      classHpPerLevel: 8,
      current: 16,
      temporary: 0,
      resistances: [],
      immunities: [],
      weaknesses: [],
    },
    conditions: [],
    deathAndDying: { dying: 0, wounded: 0, doomed: 0 },
    proficiencies: {
      weapons: {
        simple: 'trained',
        martial: 'trained',
        advanced: 'untrained',
        unarmed: 'trained',
      },
      armor: {
        unarmored: 'trained',
        light: 'trained',
        medium: 'trained',
        heavy: 'trained',
      },
    },
    strikes: [],
    currency: { cp: 0, sp: 0, gp: 150, pp: 0 },
    inventory: [],
    bulk: { current: 0, encumbered: 5, maximum: 10 },
    languages: ['Common'],
    feats: {
      ancestryAndHeritage: [],
      class: [],
      skill: [],
      general: [],
      bonus: [],
    },
    classFeatures: [],
    appearance: {
      age: '25',
      height: '5\'10"',
      weight: '170 lbs',
      eyes: 'Brown',
      skin: 'Fair',
      hair: 'Black',
    },
    personality: { traits: '', ideals: '', bonds: '', flaws: '' },
    backstory: '',
    alliesAndOrganizations: { name: '', description: '' },
    notes: '',
    treasure: '',
  };
}

/**
 * Create blank Shadowrun 6e character
 */
function createBlankSR6Character(): SR6CharacterData {
  const baseAttr = { base: 1, augmented: 1 };
  const baseSkill = {
    rank: 0,
    linkedAttribute: 'body',
    specialization: null,
    expertise: null,
    canDefault: true,
  };

  return {
    characterName: 'New Runner',
    playerName: 'Player',
    primaryAlias: 'NewRunner',
    metatype: 'Human',
    archetype: 'Street Samurai',
    karma: { current: 0, total: 0 },
    reputation: 0,
    heat: 0,
    personalData: {
      age: '25',
      sex: 'Male',
      height: '6\'0"',
      weight: '180 lbs',
      ethnicity: 'Various',
      lifestyle: 'Low',
      primaryArmor: 'Armor Jacket',
      primaryRangedWeapon: 'Ares Predator',
      primaryMeleeWeapon: 'Combat Knife',
    },
    attributes: {
      physical: {
        body: baseAttr,
        agility: baseAttr,
        reaction: baseAttr,
        strength: baseAttr,
      },
      mental: {
        willpower: baseAttr,
        logic: baseAttr,
        intuition: baseAttr,
        charisma: baseAttr,
      },
      special: {
        edge: baseAttr,
        essence: { current: 6.0, maximum: 6.0 },
        magic: null,
        resonance: null,
      },
    },
    derivedStats: {
      initiative: {
        meatspace: { base: 2, dicePools: '1d6', formula: 'Reaction + Intuition' },
        astral: null,
        matrix: null,
      },
      composure: { dicePool: 2, formula: 'Willpower + Charisma' },
      judgeIntentions: { dicePool: 2, formula: 'Willpower + Intuition' },
      memory: { dicePool: 2, formula: 'Logic + Willpower' },
      liftCarry: { dicePool: 2, formula: 'Body + Strength' },
      movement: { walk: '6m', sprint: '6m + (hits on Athletics roll)m' },
      unarmededDV: { formula: 'Strength / 2 (round up)', value: 1 },
      defenseRating: 0,
    },
    edgePoints: { maximum: 1, current: 1 },
    conditionMonitors: {
      physical: { maximum: 10, current: 10, formula: '8 + (Body / 2 round up)' },
      stun: { maximum: 10, current: 10, formula: '8 + (Willpower / 2 round up)' },
      overflow: { maximum: 1, current: 1, formula: 'Body rating' },
    },
    woundModifier: 0,
    conditions: [],
    skills: {
      astral: { ...baseSkill, linkedAttribute: 'intuition', canDefault: false },
      athletics: { ...baseSkill, linkedAttribute: 'agility' },
      biotech: { ...baseSkill, linkedAttribute: 'logic' },
      closeCombat: { ...baseSkill, linkedAttribute: 'agility' },
      con: { ...baseSkill, linkedAttribute: 'charisma' },
      conjuring: { ...baseSkill, linkedAttribute: 'magic', canDefault: false },
      cracking: { ...baseSkill, linkedAttribute: 'logic', canDefault: false },
      electronics: { ...baseSkill, linkedAttribute: 'logic' },
      enchanting: { ...baseSkill, linkedAttribute: 'magic', canDefault: false },
      engineering: { ...baseSkill, linkedAttribute: 'logic' },
      exoticWeapons: { ...baseSkill, linkedAttribute: 'agility', canDefault: false },
      firearms: { ...baseSkill, linkedAttribute: 'agility' },
      influence: { ...baseSkill, linkedAttribute: 'charisma' },
      outdoors: { ...baseSkill, linkedAttribute: 'intuition' },
      perception: { ...baseSkill, linkedAttribute: 'intuition' },
      piloting: { ...baseSkill, linkedAttribute: 'reaction' },
      sorcery: { ...baseSkill, linkedAttribute: 'magic', canDefault: false },
      stealth: { ...baseSkill, linkedAttribute: 'agility' },
      tasking: { ...baseSkill, linkedAttribute: 'resonance', canDefault: false },
    },
    knowledgeSkills: [],
    languages: [{ name: 'English', proficiency: 'native' }],
    qualities: [],
    weapons: { ranged: [], melee: [] },
    armor: [],
    augmentations: [],
    matrixStats: {
      hasMatrixDevice: true,
      commlink: 'Meta Link',
      persona: { attack: 0, sleaze: 0, dataProcessing: 1, firewall: 1 },
      matrixConditionMonitor: { maximum: 8, current: 8 },
      programs: [],
      matrixInitiative: { base: null, dicePools: null, notes: 'Non-decker' },
    },
    magic: {
      isMagicallyActive: false,
      tradition: null,
      magicRating: null,
      spells: [],
      rituals: [],
      preparations: [],
      complexForms: [],
      adeptPowers: [],
      initiationGrade: 0,
      submersionGrade: 0,
      focii: [],
    },
    contacts: [],
    ids: [],
    currency: { nuyen: 5000 },
    gear: [],
    vehicles: [],
    appearance: {
      age: '25',
      height: '6\'0"',
      weight: '180 lbs',
      eyes: 'Brown',
      skin: 'Fair',
      hair: 'Black',
    },
    personality: { traits: '', ideals: '', bonds: '', flaws: '' },
    backstory: '',
    notes: '',
  };
}

/**
 * Create blank Call of Cthulhu 7e character
 */
function createBlankCoC7eCharacter(): CoC7eCharacterData {
  const baseChar = { regular: 50, half: 25, fifth: 10 };
  const baseSkill = { baseValue: 1, currentValue: 1, improvementChecked: false };
  const baseFightingSkill = { baseValue: 25, currentValue: 25, improvementChecked: false };
  const baseFirearmsSkill = { baseValue: 20, currentValue: 20, improvementChecked: false };

  return {
    investigatorName: 'New Investigator',
    playerName: 'Player',
    occupation: 'Dilettante',
    era: '1920s',
    age: '30',
    sex: 'Male',
    residence: 'Arkham, Massachusetts',
    birthplace: 'Boston, Massachusetts',
    characteristics: {
      STR: baseChar,
      CON: baseChar,
      SIZ: baseChar,
      DEX: baseChar,
      APP: baseChar,
      INT: baseChar,
      POW: baseChar,
      EDU: baseChar,
    },
    derivedStats: {
      hp: {
        maximum: 10,
        current: 10,
        formula: '(CON + SIZ) / 10, rounded down',
        majorWoundThreshold: 5,
      },
      sanity: {
        starting: 50,
        maximum: 99,
        current: 50,
        formula: 'Starts equal to POW; max is 99 minus Cthulhu Mythos skill',
      },
      magicPoints: { maximum: 10, current: 10, formula: 'POW / 5' },
      luck: { score: 50, notes: 'Rolled 3d6 x 5' },
      damageBonus: '+0',
      build: 0,
      moveRate: 8,
      dodge: { value: 25, formula: 'DEX / 2', improvementChecked: false },
    },
    skills: {
      accounting: { ...baseSkill, baseValue: 5, currentValue: 5 },
      anthropology: baseSkill,
      appraise: { ...baseSkill, baseValue: 5, currentValue: 5 },
      archaeology: baseSkill,
      artCraft: { ...baseSkill, baseValue: 5, currentValue: 5 },
      charm: { ...baseSkill, baseValue: 15, currentValue: 15 },
      climb: { ...baseSkill, baseValue: 20, currentValue: 20 },
      creditRating: { ...baseSkill, baseValue: 0, currentValue: 20 },
      cthulhuMythos: { ...baseSkill, baseValue: 0, currentValue: 0 },
      disguise: { ...baseSkill, baseValue: 5, currentValue: 5 },
      dodge: { ...baseSkill, baseValue: 25, currentValue: 25 },
      driveAuto: { ...baseSkill, baseValue: 20, currentValue: 20 },
      electricalRepair: { ...baseSkill, baseValue: 10, currentValue: 10 },
      fastTalk: { ...baseSkill, baseValue: 5, currentValue: 5 },
      fighting: {
        brawl: baseFightingSkill,
        custom: [],
      },
      firearms: {
        handgun: baseFirearmsSkill,
        rifle: { ...baseFirearmsSkill, baseValue: 25, currentValue: 25 },
        shotgun: { ...baseFirearmsSkill, baseValue: 25, currentValue: 25 },
        custom: [],
      },
      firstAid: { ...baseSkill, baseValue: 30, currentValue: 30 },
      history: { ...baseSkill, baseValue: 5, currentValue: 5 },
      intimidate: { ...baseSkill, baseValue: 15, currentValue: 15 },
      jump: { ...baseSkill, baseValue: 20, currentValue: 20 },
      languageOwn: {
        ...baseSkill,
        language: 'English',
        baseValue: 50,
        currentValue: 50,
      },
      languageOther: [],
      law: { ...baseSkill, baseValue: 5, currentValue: 5 },
      libraryUse: { ...baseSkill, baseValue: 20, currentValue: 20 },
      listen: { ...baseSkill, baseValue: 20, currentValue: 20 },
      locksmith: baseSkill,
      mechanicalRepair: { ...baseSkill, baseValue: 10, currentValue: 10 },
      medicine: baseSkill,
      naturalWorld: { ...baseSkill, baseValue: 10, currentValue: 10 },
      navigate: { ...baseSkill, baseValue: 10, currentValue: 10 },
      occult: { ...baseSkill, baseValue: 5, currentValue: 5 },
      operateHeavyMachinery: baseSkill,
      persuade: { ...baseSkill, baseValue: 10, currentValue: 10 },
      pilot: baseSkill,
      psychoanalysis: baseSkill,
      psychology: { ...baseSkill, baseValue: 10, currentValue: 10 },
      ride: { ...baseSkill, baseValue: 5, currentValue: 5 },
      science: [],
      sleightOfHand: { ...baseSkill, baseValue: 10, currentValue: 10 },
      spotHidden: { ...baseSkill, baseValue: 25, currentValue: 25 },
      stealth: { ...baseSkill, baseValue: 20, currentValue: 20 },
      survival: { ...baseSkill, baseValue: 10, currentValue: 10 },
      swim: { ...baseSkill, baseValue: 20, currentValue: 20 },
      throw: { ...baseSkill, baseValue: 20, currentValue: 20 },
      track: { ...baseSkill, baseValue: 10, currentValue: 10 },
      customSkills: [],
    },
    combat: { weapons: [] },
    conditions: {
      unconscious: false,
      dying: false,
      majorWound: false,
      temporaryInsanity: false,
      indefiniteInsanity: false,
    },
    pulpTalents: [],
    spellsAndMythos: { cthulhuMythos: 0, spells: [] },
    possessions: [],
    wealth: {
      spendingLevel: 'Average',
      cash: 50,
      assets: '',
      notes: '',
    },
    backstory: {
      description: '',
      personalDescription: '',
      ideology: '',
      significantPeople: '',
      meaningfulLocations: '',
      treasuredPossessions: '',
      traits: '',
      injuriesAndScars: '',
      phobiasAndManias: '',
      arcaneTomesAndSpells: '',
      encountersWithStrangeEntities: '',
    },
    contacts: [],
    appearance: {
      age: '30',
      height: '5\'10"',
      weight: '170 lbs',
      eyes: 'Brown',
      hair: 'Black',
      skin: 'Fair',
    },
    notes: '',
  };
}
