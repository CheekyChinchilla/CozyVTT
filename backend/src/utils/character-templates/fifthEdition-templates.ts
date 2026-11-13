/**
 * 5E character templates: a blank sheet and one ready-made example, for
 * quick character creation. Every rules element they name is in the SRD 5.1.
 */

import { GameSystem } from '@prisma/client';
import type { CharacterTemplate } from './types';

/**
 * Blank 5E character template with minimal required fields
 */
export const fifthEditionBlankTemplate: CharacterTemplate = {
  name: 'Blank 5E Character',
  description: 'A blank character sheet for 5E',
  gameSystem: GameSystem.FIFTH_EDITION,
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
    // A Fighter: Strength and Constitution saves, a d10 hit die, and 10 + CON
    // hit points at 1st level (SRD 5.1, "Fighter").
    savingThrows: {
      strength: { proficient: true, bonus: 2 },
      dexterity: { proficient: false, bonus: 0 },
      constitution: { proficient: true, bonus: 2 },
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
    initiativeAdvantage: false,
    speed: 30,
    hp: {
      maximum: 10,
      current: 10,
      temporary: 0,
    },
    conditions: [],
    hitDice: [
      {
        class: 'Fighter',
        die: 'd10',
        maximum: 1,
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
      // Left blank rather than seeded. Every 5e character got class "Wizard"
      // and ability "Intelligence" — so a Fighter's sheet announced "Wizard
      // Spellcasting" — and DC 8 with attack +0, which no character can
      // legitimately have; the lowest legal DC at level 1 is 10. Both numbers
      // are derived now, and a sheet with nothing filled in shows no
      // spellcasting panel at all.
      class: '',
      ability: '',
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
    proficienciesAndLanguages: [],
    featuresAndTraits: [],
    personality: { traits: '', ideals: '', bonds: '', flaws: '' },
    backstory: '',
    alliesAndOrganizations: { name: '', description: '' },
    treasure: '',
    additionalFeaturesAndTraits: '',
  },
};

/**
 * Example Level 1 Fighter template
 */
export const fifthEditionFighterTemplate: CharacterTemplate = {
  name: 'Level 1 Fighter',
  description: 'A ready-to-play Level 1 Fighter with standard array stats',
  gameSystem: GameSystem.FIFTH_EDITION,
  data: {
    characterName: 'Brave Fighter',
    class: 'Fighter',
    level: 1,
    background: 'Acolyte',
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
    // Athletics and Perception from the class; Insight and Religion, and the
    // last two languages, from the Acolyte background (SRD 5.1, "Backgrounds").
    skills: {
      acrobatics: { proficient: false, expertise: false, bonus: 2 },
      animalHandling: { proficient: false, expertise: false, bonus: 1 },
      arcana: { proficient: false, expertise: false, bonus: 0 },
      athletics: { proficient: true, expertise: false, bonus: 5 },
      deception: { proficient: false, expertise: false, bonus: -1 },
      history: { proficient: false, expertise: false, bonus: 0 },
      insight: { proficient: true, expertise: false, bonus: 3 },
      intimidation: { proficient: false, expertise: false, bonus: -1 },
      investigation: { proficient: false, expertise: false, bonus: 0 },
      medicine: { proficient: false, expertise: false, bonus: 1 },
      nature: { proficient: false, expertise: false, bonus: 0 },
      perception: { proficient: true, expertise: false, bonus: 3 },
      performance: { proficient: false, expertise: false, bonus: -1 },
      persuasion: { proficient: false, expertise: false, bonus: -1 },
      religion: { proficient: true, expertise: false, bonus: 2 },
      sleightOfHand: { proficient: false, expertise: false, bonus: 2 },
      stealth: { proficient: false, expertise: false, bonus: 2 },
      survival: { proficient: false, expertise: false, bonus: 1 },
    },
    passivePerception: 13,
    // Chain mail 16, a shield 2 and the Defense fighting style 1.
    armorClass: 19,
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
        class: 'Fighter',
        die: 'd10',
        maximum: 1,
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
        // A longsword is "Versatile (1d10)" in the Weapons table (SRD 5.1,
        // "Weapons"). This used to be a free-text note, which read as prose and
        // could not be rolled.
        additionalDamage: [
          { label: 'Two-handed', damageRoll: '1d10+3', damageType: 'slashing' },
        ],
        notes: '',
      },
      {
        name: 'Shield',
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
      gp: 15,
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
      // Left blank rather than seeded. Every 5e character got class "Wizard"
      // and ability "Intelligence" — so a Fighter's sheet announced "Wizard
      // Spellcasting" — and DC 8 with attack +0, which no character can
      // legitimately have; the lowest legal DC at level 1 is 10. Both numbers
      // are derived now, and a sheet with nothing filled in shows no
      // spellcasting panel at all.
      class: '',
      ability: '',
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
    proficienciesAndLanguages: [
      'All armor',
      'Shields',
      'Simple weapons',
      'Martial weapons',
      'Common',
      'Dwarvish',
      'Celestial',
      'Elvish',
    ],
    featuresAndTraits: [
      {
        name: 'Second Wind',
        description: 'Spend a bonus action to heal 1d10 + your fighter level hit points. Once used, it recharges on a short or long rest.',
      },
      {
        name: 'Fighting Style: Defense',
        description: '+1 to your Armor Class whenever you have armor on.',
      },
      {
        name: 'Shelter of the Faithful',
        description: 'Temples and shrines of your faith heal and shelter you and your party at no charge, though you pay for any spell components.',
      },
    ],
    personality: {
      traits: 'Hums the temple hymns while sharpening a blade.',
      ideals: 'Strength is for standing between the weak and harm.',
      bonds: 'The temple that raised me can always call on my sword.',
      flaws: 'Takes any slight against the faith as a personal insult.',
    },
    backstory: 'Raised in a hilltop temple, they took up the sword the year raiders burned the village below, and left to make sure it never happens again.',
    alliesAndOrganizations: {
      name: 'The hilltop temple that raised them',
      description: '',
    },
    treasure: 'A prayer book with a pressed flower inside',
    additionalFeaturesAndTraits: '',
  },
};

/**
 * Get all available 5E templates
 */
export function getFifthEditionTemplates(): CharacterTemplate[] {
  return [fifthEditionBlankTemplate, fifthEditionFighterTemplate];
}

/**
 * Get a specific 5E template by name
 */
export function getFifthEditionTemplate(templateName?: string): CharacterTemplate {
  if (!templateName || templateName === 'blank') {
    return fifthEditionBlankTemplate;
  }

  if (templateName === 'fighter') {
    return fifthEditionFighterTemplate;
  }

  return fifthEditionBlankTemplate;
}
