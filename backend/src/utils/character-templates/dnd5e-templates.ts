/**
 * D&D 5e Character Templates
 * Provides blank and example character templates for quick character creation
 * Character Management
 */

import { GameSystem } from '@prisma/client';

export interface CharacterTemplate {
  name: string;
  description: string;
  gameSystem: GameSystem;
  data: any;
}

/**
 * Blank D&D 5e character template with minimal required fields
 */
export const dnd5eBlankTemplate: CharacterTemplate = {
  name: 'Blank D&D 5e Character',
  description: 'A blank character sheet for D&D 5th Edition',
  gameSystem: GameSystem.DND_5E,
  data: {
    characterName: 'New Character',
    class: 'Fighter',
    level: 1,
    race: 'Human',
    experiencePoints: 0,
    inspiration: false,
    proficiencyBonus: 2,
    stats: {
      strength: { score: 10, modifier: 0 },
      dexterity: { score: 10, modifier: 0 },
      constitution: { score: 10, modifier: 0 },
      intelligence: { score: 10, modifier: 0 },
      wisdom: { score: 10, modifier: 0 },
      charisma: { score: 10, modifier: 0 },
    },
    savingThrows: {
      strength: { proficient: false, bonus: 0 },
      dexterity: { proficient: false, bonus: 0 },
      constitution: { proficient: false, bonus: 0 },
      intelligence: { proficient: false, bonus: 0 },
      wisdom: { proficient: false, bonus: 0 },
      charisma: { proficient: false, bonus: 0 },
    },
    skills: {
      acrobatics: { proficient: false, expertise: false, bonus: 0 },
      animalHandling: { proficient: false, expertise: false, bonus: 0 },
      arcana: { proficient: false, expertise: false, bonus: 0 },
      athletics: { proficient: false, expertise: false, bonus: 0 },
      deception: { proficient: false, expertise: false, bonus: 0 },
      history: { proficient: false, expertise: false, bonus: 0 },
      insight: { proficient: false, expertise: false, bonus: 0 },
      intimidation: { proficient: false, expertise: false, bonus: 0 },
      investigation: { proficient: false, expertise: false, bonus: 0 },
      medicine: { proficient: false, expertise: false, bonus: 0 },
      nature: { proficient: false, expertise: false, bonus: 0 },
      perception: { proficient: false, expertise: false, bonus: 0 },
      performance: { proficient: false, expertise: false, bonus: 0 },
      persuasion: { proficient: false, expertise: false, bonus: 0 },
      religion: { proficient: false, expertise: false, bonus: 0 },
      sleightOfHand: { proficient: false, expertise: false, bonus: 0 },
      stealth: { proficient: false, expertise: false, bonus: 0 },
      survival: { proficient: false, expertise: false, bonus: 0 },
    },
    passivePerception: 10,
    armorClass: 10,
    initiative: 0,
    speed: 30,
    hp: {
      maximum: 8,
      current: 8,
      temporary: 0,
    },
    conditions: [],
    hitDice: [
      {
        class: 'Fighter',
        total: '1d8',
        remaining: 1,
      },
    ],
    deathSaves: {
      successes: 0,
      failures: 0,
    },
    attacks: [],
    currency: {
      cp: 0,
      sp: 0,
      ep: 0,
      gp: 0,
      pp: 0,
    },
    inventory: [],
    spellcasting: {
      class: 'Wizard',
      ability: 'Intelligence',
      spellSaveDC: 8,
      spellAttackBonus: 0,
      cantrips: [],
      slots: {
        '1': { total: 0, expended: 0 },
        '2': { total: 0, expended: 0 },
        '3': { total: 0, expended: 0 },
        '4': { total: 0, expended: 0 },
        '5': { total: 0, expended: 0 },
        '6': { total: 0, expended: 0 },
        '7': { total: 0, expended: 0 },
        '8': { total: 0, expended: 0 },
        '9': { total: 0, expended: 0 },
      },
      spells: [],
    },
    languages: [],
    proficiencies: [],
    features: [],
    personalityTraits: '',
    ideals: '',
    bonds: '',
    flaws: '',
    backstory: '',
    allies: '',
    treasure: '',
    additionalFeaturesAndTraits: '',
  },
};

/**
 * Example Level 1 Fighter template
 */
export const dnd5eFighterTemplate: CharacterTemplate = {
  name: 'Level 1 Fighter',
  description: 'A ready-to-play Level 1 Fighter with standard array stats',
  gameSystem: GameSystem.DND_5E,
  data: {
    characterName: 'Brave Fighter',
    class: 'Fighter',
    level: 1,
    background: 'Soldier',
    race: 'Human',
    alignment: 'Lawful Good',
    experiencePoints: 0,
    inspiration: false,
    proficiencyBonus: 2,
    stats: {
      strength: { score: 16, modifier: 3 },
      dexterity: { score: 14, modifier: 2 },
      constitution: { score: 14, modifier: 2 },
      intelligence: { score: 10, modifier: 0 },
      wisdom: { score: 12, modifier: 1 },
      charisma: { score: 8, modifier: -1 },
    },
    savingThrows: {
      strength: { proficient: true, bonus: 5 },
      dexterity: { proficient: false, bonus: 2 },
      constitution: { proficient: true, bonus: 4 },
      intelligence: { proficient: false, bonus: 0 },
      wisdom: { proficient: false, bonus: 1 },
      charisma: { proficient: false, bonus: -1 },
    },
    skills: {
      acrobatics: { proficient: false, expertise: false, bonus: 2 },
      animalHandling: { proficient: false, expertise: false, bonus: 1 },
      arcana: { proficient: false, expertise: false, bonus: 0 },
      athletics: { proficient: true, expertise: false, bonus: 5 },
      deception: { proficient: false, expertise: false, bonus: -1 },
      history: { proficient: false, expertise: false, bonus: 0 },
      insight: { proficient: false, expertise: false, bonus: 1 },
      intimidation: { proficient: true, expertise: false, bonus: 1 },
      investigation: { proficient: false, expertise: false, bonus: 0 },
      medicine: { proficient: false, expertise: false, bonus: 1 },
      nature: { proficient: false, expertise: false, bonus: 0 },
      perception: { proficient: true, expertise: false, bonus: 3 },
      performance: { proficient: false, expertise: false, bonus: -1 },
      persuasion: { proficient: false, expertise: false, bonus: -1 },
      religion: { proficient: false, expertise: false, bonus: 0 },
      sleightOfHand: { proficient: false, expertise: false, bonus: 2 },
      stealth: { proficient: false, expertise: false, bonus: 2 },
      survival: { proficient: true, expertise: false, bonus: 3 },
    },
    passivePerception: 13,
    armorClass: 18,
    initiative: 2,
    speed: 30,
    hp: {
      maximum: 12,
      current: 12,
      temporary: 0,
    },
    conditions: [],
    hitDice: [
      {
        class: 'fighter',
        total: '1d10',
        remaining: 1,
      },
    ],
    deathSaves: {
      successes: 0,
      failures: 0,
    },
    attacks: [
      {
        name: 'Longsword',
        attackBonus: 5,
        damageRoll: '1d8+3',
        damageType: 'slashing',
        range: 5,
        properties: ['versatile'],
        notes: 'Two-handed: 1d10+3',
      },
      {
        name: 'Shield Bash',
        attackBonus: 5,
        damageRoll: '1d4+3',
        damageType: 'bludgeoning',
        range: 5,
        properties: [],
        notes: 'Improvised weapon',
      },
    ],
    currency: {
      cp: 0,
      sp: 0,
      ep: 0,
      gp: 10,
      pp: 0,
    },
    inventory: [
      {
        name: 'Chain Mail',
        quantity: 1,
        weight: 55,
        notes: 'AC 16, Heavy Armor',
        equippable: true,
        equipped: true,
        requiresAttunement: false,
        attuned: false,
        value: 75,
      },
      {
        name: 'Shield',
        quantity: 1,
        weight: 6,
        notes: '+2 AC',
        equippable: true,
        equipped: true,
        requiresAttunement: false,
        attuned: false,
        value: 10,
      },
      {
        name: 'Longsword',
        quantity: 1,
        weight: 3,
        notes: 'Versatile (1d8/1d10)',
        equippable: true,
        equipped: true,
        requiresAttunement: false,
        attuned: false,
        value: 15,
      },
      {
        name: 'Backpack',
        quantity: 1,
        weight: 5,
        notes: 'Contains adventuring gear',
        equippable: false,
        equipped: true,
        requiresAttunement: false,
        attuned: false,
        value: 2,
      },
    ],
    spellcasting: {
      class: 'Wizard',
      ability: 'Intelligence',
      spellSaveDC: 8,
      spellAttackBonus: 0,
      cantrips: [],
      slots: {
        '1': { total: 0, expended: 0 },
        '2': { total: 0, expended: 0 },
        '3': { total: 0, expended: 0 },
        '4': { total: 0, expended: 0 },
        '5': { total: 0, expended: 0 },
        '6': { total: 0, expended: 0 },
        '7': { total: 0, expended: 0 },
        '8': { total: 0, expended: 0 },
        '9': { total: 0, expended: 0 },
      },
      spells: [],
    },
    languages: ['Common'],
    proficiencies: ['All armor', 'All shields', 'Simple weapons', 'Martial weapons'],
    features: [
      {
        name: 'Second Wind',
        description: 'You have a limited well of stamina that you can draw on to protect yourself from harm. On your turn, you can use a bonus action to regain hit points equal to 1d10 + your fighter level. Once you use this feature, you must finish a short or long rest before you can use it again.',
      },
      {
        name: 'Fighting Style: Defense',
        description: 'While you are wearing armor, you gain a +1 bonus to AC.',
      },
    ],
    personalityTraits: 'I can stare down a hell hound without flinching.',
    ideals: 'Greater Good: Our lot is to lay down our lives in defense of others.',
    bonds: 'I would still lay down my life for the people I served with.',
    flaws: 'I have little respect for anyone who is not a proven warrior.',
    backstory: 'A veteran soldier who served with distinction in the recent war.',
    allies: 'Former members of the military unit',
    treasure: 'A trophy from a fallen enemy',
    additionalFeaturesAndTraits: '',
  },
};

/**
 * Get all available D&D 5e templates
 */
export function getDnD5eTemplates(): CharacterTemplate[] {
  return [dnd5eBlankTemplate, dnd5eFighterTemplate];
}

/**
 * Get a specific D&D 5e template by name
 */
export function getDnD5eTemplate(templateName?: string): CharacterTemplate {
  if (!templateName || templateName === 'blank') {
    return dnd5eBlankTemplate;
  }

  if (templateName === 'fighter') {
    return dnd5eFighterTemplate;
  }

  return dnd5eBlankTemplate;
}
