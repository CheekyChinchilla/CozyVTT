/**
 * Pathfinder 2e Character Templates
 * Provides blank and example character templates for quick character creation
 * Per SOW Section 5.4: Character Management
 */

import { GameSystem } from '@prisma/client';

export interface CharacterTemplate {
  name: string;
  description: string;
  gameSystem: GameSystem;
  data: any;
}

/**
 * Blank Pathfinder 2e character template with minimal required fields
 */
export const pf2eBlankTemplate: CharacterTemplate = {
  name: 'Blank Pathfinder 2e Character',
  description: 'A blank character sheet for Pathfinder 2nd Edition',
  gameSystem: GameSystem.PATHFINDER_2E,
  data: {
    characterName: 'New Character',
    ancestry: 'Human',
    heritage: 'Versatile Heritage',
    class: 'Fighter',
    level: 1,
    attributes: {
      strength: { score: 10, modifier: 0 },
      dexterity: { score: 10, modifier: 0 },
      constitution: { score: 10, modifier: 0 },
      intelligence: { score: 10, modifier: 0 },
      wisdom: { score: 10, modifier: 0 },
      charisma: { score: 10, modifier: 0 },
    },
    hp: {
      maximum: 10,
      ancestryHp: 0,
      classHpPerLevel: 0,
      current: 10,
      temporary: 0,
      resistances: [],
      immunities: [],
      weaknesses: [],
    },
    armorClass: {
      total: 10,
      proficiencyRank: 'untrained',
      capDex: null,
      itemBonus: 0,
      armorPenalty: 0,
    },
    savingThrows: {
      fortitude: { proficiencyRank: 'untrained', itemBonus: 0, bonus: 0 },
      reflex: { proficiencyRank: 'untrained', itemBonus: 0, bonus: 0 },
      will: { proficiencyRank: 'untrained', itemBonus: 0, bonus: 0 },
    },
    perception: {
      proficiencyRank: 'untrained',
      itemBonus: 0,
      bonus: 0,
      senses: [],
    },
    classDC: {
      total: 10,
      keyAttribute: 'str',
      proficiencyRank: 'untrained',
    },
    speed: {
      land: 25,
      other: [],
    },
    attacks: [],
    skills: {
      acrobatics: { attribute: 'dex', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      arcana: { attribute: 'int', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      athletics: { attribute: 'str', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      crafting: { attribute: 'int', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      deception: { attribute: 'cha', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      diplomacy: { attribute: 'cha', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      intimidation: { attribute: 'cha', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      medicine: { attribute: 'wis', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      nature: { attribute: 'wis', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      occultism: { attribute: 'int', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      performance: { attribute: 'cha', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      religion: { attribute: 'wis', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      society: { attribute: 'int', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      stealth: { attribute: 'dex', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      survival: { attribute: 'wis', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      thievery: { attribute: 'dex', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
    },
    feats: {
      ancestryAndHeritage: [],
      class: [],
      skill: [],
      general: [],
      bonus: [],
    },
    specialAbilities: [],
    inventory: [],
    bulk: {
      current: 0,
      encumbered: 5,
      maximum: 10,
    },
    currency: {
      cp: 0,
      sp: 0,
      gp: 0,
      pp: 0,
    },
    spellcasting: {
      tradition: 'Arcane',
      type: 'Prepared',
      keyAttribute: 'int',
      spellAttackBonus: { proficiencyRank: 'untrained', itemBonus: 0, bonus: 0 },
      spellDC: { proficiencyRank: 'untrained', itemBonus: 0, dc: 10 },
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
        '10': { total: 0, expended: 0 },
      },
      spells: [],
      focusSpells: {
        focusPoints: { total: 0, current: 0 },
        spells: [],
      },
      innateSpells: [],
      rituals: [],
    },
    languages: ['Common'],
    senses: ['Normal vision'],
    resistances: [],
    immunities: [],
    conditions: [],
    notes: '',
  },
};

/**
 * Example Level 1 Fighter template
 */
export const pf2eFighterTemplate: CharacterTemplate = {
  name: 'Level 1 Fighter',
  description: 'A ready-to-play Level 1 Fighter (Dwarf)',
  gameSystem: GameSystem.PATHFINDER_2E,
  data: {
    characterName: 'Dwarven Defender',
    ancestry: 'Dwarf',
    heritage: 'Mountain Dwarf',
    background: 'Warrior',
    class: 'Fighter',
    level: 1,
    experiencePoints: 0,
    alignment: 'Lawful Good',
    deity: 'Torag',
    attributes: {
      strength: { score: 16, modifier: 3 },
      dexterity: { score: 12, modifier: 1 },
      constitution: { score: 14, modifier: 2 },
      intelligence: { score: 10, modifier: 0 },
      wisdom: { score: 12, modifier: 1 },
      charisma: { score: 8, modifier: -1 },
    },
    hp: {
      maximum: 21,
      ancestryHp: 10,
      classHpPerLevel: 10,
      current: 21,
      temporary: 0,
      resistances: [],
      immunities: [],
      weaknesses: [],
    },
    armorClass: {
      total: 18,
      proficiencyRank: 'trained',
      capDex: 2,
      itemBonus: 3,
      armorPenalty: 0,
    },
    savingThrows: {
      fortitude: { proficiencyRank: 'expert', itemBonus: 0, bonus: 7 },
      reflex: { proficiencyRank: 'expert', itemBonus: 0, bonus: 6 },
      will: { proficiencyRank: 'trained', itemBonus: 0, bonus: 4 },
    },
    perception: {
      proficiencyRank: 'expert',
      itemBonus: 0,
      bonus: 6,
      senses: ['Darkvision'],
    },
    classDC: {
      total: 17,
      keyAttribute: 'str',
      proficiencyRank: 'trained',
    },
    speed: {
      land: 20,
      other: [],
    },
    attacks: [
      {
        name: 'Warhammer',
        attackBonus: 7,
        damageRoll: '1d8+3',
        damageType: 'bludgeoning',
        traits: ['Dwarf', 'Shove'],
        range: 'melee',
        notes: 'Versatile P',
      },
      {
        name: 'Crossbow',
        attackBonus: 5,
        damageRoll: '1d8',
        damageType: 'piercing',
        traits: ['Range 120ft', 'Reload 1'],
        range: 'ranged',
        notes: '',
      },
    ],
    skills: {
      acrobatics: { attribute: 'dex', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 1 },
      arcana: { attribute: 'int', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      athletics: { attribute: 'str', proficiencyRank: 'trained', armorPenalty: 0, itemBonus: 0, bonus: 6 },
      crafting: { attribute: 'int', proficiencyRank: 'trained', armorPenalty: 0, itemBonus: 0, bonus: 3 },
      deception: { attribute: 'cha', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: -1 },
      diplomacy: { attribute: 'cha', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: -1 },
      intimidation: { attribute: 'cha', proficiencyRank: 'trained', armorPenalty: 0, itemBonus: 0, bonus: 2 },
      medicine: { attribute: 'wis', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 1 },
      nature: { attribute: 'wis', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 1 },
      occultism: { attribute: 'int', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      performance: { attribute: 'cha', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: -1 },
      religion: { attribute: 'wis', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 1 },
      society: { attribute: 'int', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      stealth: { attribute: 'dex', proficiencyRank: 'trained', armorPenalty: 0, itemBonus: 0, bonus: 4 },
      survival: { attribute: 'wis', proficiencyRank: 'trained', armorPenalty: 0, itemBonus: 0, bonus: 4 },
      thievery: { attribute: 'dex', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 1 },
    },
    loreSkills: [
      { name: 'Warfare Lore', attribute: 'int', proficiencyRank: 'trained', itemBonus: 0, bonus: 3 },
    ],
    feats: {
      ancestryAndHeritage: [
        { level: 1, name: 'Darkvision', notes: 'You can see in darkness and dim light as well as you can see in bright light.' },
      ],
      class: [
        { level: 1, name: 'Power Attack', notes: 'Make a melee Strike. The Strike deals two extra weapon damage dice.' },
      ],
      skill: [],
      general: [],
      bonus: [],
    },
    specialAbilities: [
      {
        name: 'Attack of Opportunity',
        description: 'You can make melee Strikes against creatures that move adjacent to you or take certain actions.',
      },
      {
        name: 'Shield Block',
        description: 'You can use your shield to prevent damage.',
      },
    ],
    inventory: [
      {
        name: 'Warhammer',
        quantity: 1,
        bulk: 1,
        equippable: true,
        equipped: true,
        requiresAttunement: false,
        attuned: false,
        invested: false,
        value: 1,
        notes: 'Your primary weapon',
      },
      {
        name: 'Steel Shield',
        quantity: 1,
        bulk: 1,
        equippable: true,
        equipped: true,
        requiresAttunement: false,
        attuned: false,
        invested: false,
        value: 2,
        notes: 'Hardness 5, HP 20, BT 10',
      },
      {
        name: 'Scale Mail',
        quantity: 1,
        bulk: 2,
        equippable: true,
        equipped: true,
        requiresAttunement: false,
        attuned: false,
        invested: false,
        value: 4,
        notes: 'AC +3, Dex Cap +2',
      },
      {
        name: 'Crossbow',
        quantity: 1,
        bulk: 1,
        equippable: true,
        equipped: false,
        requiresAttunement: false,
        attuned: false,
        invested: false,
        value: 1,
        notes: 'Range 120ft',
      },
      {
        name: 'Bolts (10)',
        quantity: 1,
        bulk: 0.1,
        equippable: false,
        equipped: false,
        requiresAttunement: false,
        attuned: false,
        invested: false,
        value: 0.1,
        notes: 'Ammunition',
      },
      {
        name: 'Backpack',
        quantity: 1,
        bulk: 0.1,
        equippable: false,
        equipped: false,
        requiresAttunement: false,
        attuned: false,
        invested: false,
        value: 0.1,
        notes: 'Contains adventuring gear',
      },
    ],
    bulk: {
      current: 5.3,
      encumbered: 10,
      maximum: 15,
    },
    currency: {
      cp: 0,
      sp: 0,
      gp: 5,
      pp: 0,
    },
    spellcasting: {
      tradition: 'Arcane',
      type: 'Prepared',
      keyAttribute: 'int',
      spellAttackBonus: { proficiencyRank: 'untrained', itemBonus: 0, bonus: 0 },
      spellDC: { proficiencyRank: 'untrained', itemBonus: 0, dc: 10 },
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
        '10': { total: 0, expended: 0 },
      },
      spells: [],
      focusSpells: {
        focusPoints: { total: 0, current: 0 },
        spells: [],
      },
      innateSpells: [],
      rituals: [],
    },
    languages: ['Common', 'Dwarven'],
    senses: ['Darkvision (60 feet)'],
    resistances: [],
    immunities: [],
    conditions: [],
    notes: 'A sturdy dwarf fighter, trained in the ways of war.',
  },
};

/**
 * Get all available Pathfinder 2e templates
 */
export function getPF2eTemplates(): CharacterTemplate[] {
  return [pf2eBlankTemplate, pf2eFighterTemplate];
}

/**
 * Get a specific Pathfinder 2e template by name
 */
export function getPF2eTemplate(templateName?: string): CharacterTemplate {
  if (!templateName || templateName === 'blank') {
    return pf2eBlankTemplate;
  }

  if (templateName === 'fighter') {
    return pf2eFighterTemplate;
  }

  return pf2eBlankTemplate;
}
