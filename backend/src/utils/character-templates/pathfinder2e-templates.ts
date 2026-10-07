/**
 * Pathfinder 2e Character Templates
 * Provides blank and example character templates for quick character creation
 * Character Management
 */

import { GameSystem } from '@prisma/client';

export interface CharacterTemplate {
  name: string;
  description: string;
  gameSystem: GameSystem;
  /** The sheet itself. Shaped by `gameSystem`; validated by that system's Zod schema. */
  data: Record<string, unknown>;
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
      keyAttribute: 'strength',
      proficiencyRank: 'untrained',
    },
    speed: {
      land: 25,
      other: [],
    },
    strikes: [],
    // Attributes, traditions and casting types are spelled as the editor
    // offers them. It looks attributes up by full name, so a template that
    // abbreviated them had its skill totals recomputed without the attribute.
    skills: {
      acrobatics: { attribute: 'dexterity', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      arcana: { attribute: 'intelligence', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      athletics: { attribute: 'strength', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      crafting: { attribute: 'intelligence', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      deception: { attribute: 'charisma', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      diplomacy: { attribute: 'charisma', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      intimidation: { attribute: 'charisma', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      medicine: { attribute: 'wisdom', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      nature: { attribute: 'wisdom', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      occultism: { attribute: 'intelligence', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      performance: { attribute: 'charisma', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      religion: { attribute: 'wisdom', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      society: { attribute: 'intelligence', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      stealth: { attribute: 'dexterity', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      survival: { attribute: 'wisdom', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      thievery: { attribute: 'dexterity', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
    },
    feats: {
      ancestryAndHeritage: [],
      class: [],
      skill: [],
      general: [],
      bonus: [],
    },
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
      tradition: 'arcane',
      type: 'prepared',
      keyAttribute: 'intelligence',
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
      // 10 + Dex 1 (capped at 2) + trained 3 + scale mail 3. Was 18, which did
      // not follow from the components recorded alongside it.
      total: 17,
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
      // 10 + trained 3 + Strength 3. Was 17.
      total: 16,
      keyAttribute: 'strength',
      proficiencyRank: 'trained',
    },
    speed: {
      land: 20,
      other: [],
    },
    strikes: [
      {
        name: 'Warhammer',
        attackBonus: 7,
        damageRoll: '1d8+3',
        damageType: 'bludgeoning',
        traits: ['Dwarf', 'Shove'],
        type: 'melee',
        notes: 'Versatile P',
      },
      {
        name: 'Crossbow',
        attackBonus: 5,
        damageRoll: '1d8',
        damageType: 'piercing',
        traits: ['Range 120ft', 'Reload 1'],
        type: 'ranged',
        notes: '',
      },
    ],
    skills: {
      acrobatics: { attribute: 'dexterity', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 1 },
      arcana: { attribute: 'intelligence', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      athletics: { attribute: 'strength', proficiencyRank: 'trained', armorPenalty: 0, itemBonus: 0, bonus: 6 },
      crafting: { attribute: 'intelligence', proficiencyRank: 'trained', armorPenalty: 0, itemBonus: 0, bonus: 3 },
      deception: { attribute: 'charisma', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: -1 },
      diplomacy: { attribute: 'charisma', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: -1 },
      intimidation: { attribute: 'charisma', proficiencyRank: 'trained', armorPenalty: 0, itemBonus: 0, bonus: 2 },
      medicine: { attribute: 'wisdom', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 1 },
      nature: { attribute: 'wisdom', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 1 },
      occultism: { attribute: 'intelligence', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      performance: { attribute: 'charisma', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: -1 },
      religion: { attribute: 'wisdom', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 1 },
      society: { attribute: 'intelligence', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
      stealth: { attribute: 'dexterity', proficiencyRank: 'trained', armorPenalty: 0, itemBonus: 0, bonus: 4 },
      survival: { attribute: 'wisdom', proficiencyRank: 'trained', armorPenalty: 0, itemBonus: 0, bonus: 4 },
      thievery: { attribute: 'dexterity', proficiencyRank: 'untrained', armorPenalty: 0, itemBonus: 0, bonus: 1 },
    },
    loreSkills: [
      { name: 'Warfare Lore', attribute: 'intelligence', proficiencyRank: 'trained', itemBonus: 0, bonus: 3 },
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
    classFeatures: [
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
      tradition: 'arcane',
      type: 'prepared',
      keyAttribute: 'intelligence',
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
