// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * Fantasy d20 character templates: a blank sheet and one ready-made example,
 * for quick character creation. Every rules element they name is in the rules
 * released under the ORC licence, and both leave alignment and deity empty,
 * for the player to fill.
 */

import { GameSystem } from '@prisma/client';
import type { CharacterTemplate } from './types';

/**
 * Blank Fantasy d20 character template with minimal required fields
 */
export const fantasyD20BlankTemplate: CharacterTemplate = {
  name: 'Blank Fantasy d20 Character',
  description: 'A blank character sheet for Fantasy d20',
  gameSystem: GameSystem.FANTASY_D20,
  data: {
    characterName: 'New Character',
    ancestry: 'Human',
    heritage: 'Versatile Human',
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
    // A Human (8) Fighter (10) with Constitution +0.
    hp: {
      maximum: 18,
      ancestryHp: 8,
      classHpPerLevel: 10,
      current: 18,
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
    // No Class DC: its key attribute is the class's, which the player chooses
    // in the editor, and the Class DC is stored then.
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
export const fantasyD20FighterTemplate: CharacterTemplate = {
  name: 'Level 1 Fighter',
  description: 'A ready-to-play Level 1 Fighter (Dwarf)',
  gameSystem: GameSystem.FANTASY_D20,
  data: {
    characterName: 'Stout Defender',
    ancestry: 'Dwarf',
    heritage: 'Rock Dwarf',
    background: 'Warrior',
    class: 'Fighter',
    level: 1,
    experiencePoints: 0,
    attributes: {
      strength: { score: 16, modifier: 3 },
      dexterity: { score: 12, modifier: 1 },
      constitution: { score: 14, modifier: 2 },
      intelligence: { score: 10, modifier: 0 },
      wisdom: { score: 12, modifier: 1 },
      charisma: { score: 8, modifier: -1 },
    },
    hp: {
      maximum: 22,
      ancestryHp: 10,
      classHpPerLevel: 10,
      current: 22,
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
        attackBonus: 8,
        attributeModifier: 'strength',
        proficiencyRank: 'expert',
        itemBonus: 0,
        damageRoll: '1d8+3',
        damageType: 'bludgeoning',
        traits: ['Shove'],
        type: 'melee',
        notes: '',
      },
      {
        name: 'Crossbow',
        attackBonus: 6,
        attributeModifier: 'dexterity',
        proficiencyRank: 'expert',
        itemBonus: 0,
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
    // The Warrior background gives Intimidation, Warfare Lore and the
    // Intimidating Glare skill feat; the ancestry, Darkvision.
    feats: {
      ancestryAndHeritage: [
        { level: 1, name: 'Unburdened Iron', notes: 'Armor never slows you, and other slowing effects take 5 feet less off your Speed.' },
      ],
      class: [
        { level: 1, name: 'Vicious Swing', notes: 'Two actions for one heavy melee Strike: a hit deals an extra weapon damage die, and your multiple attack penalty afterwards is as if you had attacked twice.' },
      ],
      skill: [
        { level: 1, name: 'Intimidating Glare', notes: 'You can Demoralize with a look alone, so the target needs no shared language.' },
      ],
      general: [],
      bonus: [],
    },
    classFeatures: [
      {
        name: 'Reactive Strike',
        description: 'Your reaction: a melee Strike against a creature in your reach that moves, leaves a square, makes a ranged attack or uses a manipulate action. Your multiple attack penalty does not touch it.',
      },
      {
        name: 'Shield Block',
        description: 'Your reaction when a physical blow lands while your shield is raised: the shield absorbs damage up to its Hardness, and the rest is dealt both to you and to the shield.',
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
    // Strength +3: encumbered above 8, at most 13. The two light items count
    // as no Bulk until there are ten, and 5 gp as none until there are 1,000
    // coins.
    bulk: {
      current: 5,
      encumbered: 8,
      maximum: 13,
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
    notes: 'Signed on as a caravan guard at sixteen, and has walked every road between the mountain halls and the coast since.',
  },
};

/**
 * Get all available Fantasy d20 templates
 */
export function getFantasyD20Templates(): CharacterTemplate[] {
  return [fantasyD20BlankTemplate, fantasyD20FighterTemplate];
}

/**
 * Get a specific Fantasy d20 template by name
 */
export function getFantasyD20Template(templateName?: string): CharacterTemplate {
  if (!templateName || templateName === 'blank') {
    return fantasyD20BlankTemplate;
  }

  if (templateName === 'fighter') {
    return fantasyD20FighterTemplate;
  }

  return fantasyD20BlankTemplate;
}
