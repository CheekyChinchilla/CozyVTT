/**
 * Shadowrun 6e Character Templates
 * Provides blank and example character templates for quick character creation
 * Character Management
 * Note: the Shadowrun 6e backend is complete; the character sheet UI is not yet built.
 */

import { GameSystem } from '@prisma/client';

export interface CharacterTemplate {
  name: string;
  description: string;
  gameSystem: GameSystem;
  data: any;
}

/**
 * Blank Shadowrun 6e character template with minimal required fields
 */
export const shadowrun6eBlankTemplate: CharacterTemplate = {
  name: 'Blank Shadowrun 6e Character',
  description: 'A blank character sheet for Shadowrun 6th Edition',
  gameSystem: GameSystem.SHADOWRUN_6E,
  data: {
    characterName: 'New Runner',
    metatype: 'Human',
    archetype: 'Street Samurai',
    attributes: {
      physical: {
        body: { base: 1, augmented: 1 },
        agility: { base: 1, augmented: 1 },
        reaction: { base: 1, augmented: 1 },
        strength: { base: 1, augmented: 1 },
      },
      mental: {
        willpower: { base: 1, augmented: 1 },
        logic: { base: 1, augmented: 1 },
        intuition: { base: 1, augmented: 1 },
        charisma: { base: 1, augmented: 1 },
      },
      special: {
        edge: { base: 1, augmented: 1 },
        essence: { current: 6, maximum: 6 },
        magic: null,
        resonance: null,
      },
    },
  },
};

/**
 * Example Street Samurai template
 */
export const shadowrun6eStreetsamurai: CharacterTemplate = {
  name: 'Street Samurai',
  description: 'A combat-focused Street Samurai with cyberware',
  gameSystem: GameSystem.SHADOWRUN_6E,
  data: {
    characterName: 'Chrome Warrior',
    metatype: 'Human',
    archetype: 'Street Samurai',
    attributes: {
      physical: {
        body: { base: 5, augmented: 5 },
        agility: { base: 6, augmented: 8 },
        reaction: { base: 5, augmented: 6 },
        strength: { base: 4, augmented: 4 },
      },
      mental: {
        willpower: { base: 3, augmented: 3 },
        logic: { base: 2, augmented: 2 },
        intuition: { base: 4, augmented: 4 },
        charisma: { base: 2, augmented: 2 },
      },
      special: {
        edge: { base: 2, augmented: 2 },
        essence: { current: 3.7, maximum: 6 },
        magic: null,
        resonance: null,
      },
    },
    derivedStats: {
      initiative: {
        meatspace: { base: 10, dicePools: '1d6', formula: 'Reaction + Intuition' },
        astral: null,
        matrix: null,
      },
      composure: { dicePool: 5, formula: 'Charisma + Willpower' },
      judgeIntentions: { dicePool: 6, formula: 'Charisma + Intuition' },
      memory: { dicePool: 6, formula: 'Logic + Intuition' },
      liftCarry: { dicePool: 90, formula: 'Strength x 15' },
      movement: { walk: '10m', sprint: '25m' },
      unarmededDV: { formula: 'Strength/2', value: 2 },
      defenseRating: 12,
    },
    edgePoints: {
      maximum: 2,
      current: 2,
    },
    conditionMonitors: {
      physical: { maximum: 12, current: 0, formula: '8 + (Body/2)' },
      stun: { maximum: 10, current: 0, formula: '8 + (Willpower/2)' },
      overflow: { maximum: 5, current: 0, formula: 'Body' },
    },
    skills: {
      astral: { rank: 0, linkedAttribute: 'intuition', specialization: null, expertise: null, canDefault: false },
      athletics: { rank: 4, linkedAttribute: 'agility', specialization: null, expertise: null, canDefault: true },
      biotech: { rank: 0, linkedAttribute: 'logic', specialization: null, expertise: null, canDefault: true },
      closeCombat: { rank: 5, linkedAttribute: 'agility', specialization: null, expertise: null, canDefault: true },
      con: { rank: 0, linkedAttribute: 'charisma', specialization: null, expertise: null, canDefault: true },
      conjuring: { rank: 0, linkedAttribute: 'magic', specialization: null, expertise: null, canDefault: false },
      cracking: { rank: 0, linkedAttribute: 'logic', specialization: null, expertise: null, canDefault: true },
      electronics: { rank: 0, linkedAttribute: 'logic', specialization: null, expertise: null, canDefault: true },
      enchanting: { rank: 0, linkedAttribute: 'magic', specialization: null, expertise: null, canDefault: false },
      engineering: { rank: 0, linkedAttribute: 'logic', specialization: null, expertise: null, canDefault: true },
      exoticWeapons: { rank: 0, linkedAttribute: 'agility', specialization: null, expertise: null, canDefault: false },
      firearms: { rank: 6, linkedAttribute: 'agility', specialization: null, expertise: null, canDefault: true },
      influence: { rank: 0, linkedAttribute: 'charisma', specialization: null, expertise: null, canDefault: true },
      outdoors: { rank: 0, linkedAttribute: 'intuition', specialization: null, expertise: null, canDefault: true },
      perception: { rank: 4, linkedAttribute: 'intuition', specialization: null, expertise: null, canDefault: true },
      piloting: { rank: 0, linkedAttribute: 'reaction', specialization: null, expertise: null, canDefault: true },
      sorcery: { rank: 0, linkedAttribute: 'magic', specialization: null, expertise: null, canDefault: false },
      stealth: { rank: 3, linkedAttribute: 'agility', specialization: null, expertise: null, canDefault: true },
      tasking: { rank: 0, linkedAttribute: 'resonance', specialization: null, expertise: null, canDefault: false },
    },
    knowledgeSkills: [
      { name: 'Street Gangs', type: 'street', rank: 2 },
      { name: 'Security Procedures', type: 'professional', rank: 3 },
    ],
    languages: [
      { name: 'English', proficiency: 'native' },
      { name: 'Japanese', proficiency: 'basic' },
    ],
    qualities: [
      {
        name: 'Ambidextrous',
        type: 'positive',
        cost: 4,
        notes: 'No penalty for using off-hand weapon',
      },
    ],
    weapons: {
      ranged: [
        {
          name: 'Ares Predator V',
          type: 'Heavy Pistol',
          dicePool: 14,
          dv: '3P',
          attackRatings: { close: 5, near: 4, far: 2, extreme: null },
          firingModes: ['SA', 'BF'],
          capacity: 15,
          ammoLoaded: 15,
          ammoType: 'Standard',
          notes: '',
        },
      ],
      melee: [
        {
          name: 'Katana',
          type: 'Blade',
          dicePool: 11,
          dv: '(STR+3)P',
          attackRatings: { close: 7 },
          notes: 'Reach 1',
        },
      ],
    },
    armor: [
      {
        name: 'Armor Jacket',
        defenseRating: 12,
        notes: '',
        equipped: true,
      },
    ],
    augmentations: [
      {
        name: 'Wired Reflexes 1',
        rating: 1,
        essenceCost: 2.0,
        type: 'cyberware',
        notes: '+1 Reaction, +1d6 Initiative',
      },
      {
        name: 'Cybereyes',
        rating: 2,
        essenceCost: 0.3,
        type: 'cyberware',
        notes: 'Low-light vision, Image Link, Smartlink',
      },
    ],
    contacts: [
      {
        name: 'Street Doc',
        role: 'Medical',
        loyalty: 2,
        connection: 3,
        notes: 'Underground medical professional',
      },
      {
        name: 'Fixer',
        role: 'Broker',
        loyalty: 3,
        connection: 4,
        notes: 'Job broker and gear supplier',
      },
    ],
    currency: {
      nuyen: 1000,
    },
    gear: [
      { name: 'Commlink (Renraku Sensei)', rating: 3, quantity: 1, notes: '' },
      { name: 'Medkit', rating: 3, quantity: 1, notes: '' },
      { name: 'Stim Patches', rating: 6, quantity: 2, notes: '' },
    ],
    karma: {
      current: 0,
      total: 0,
    },
    notes: 'A professional combatant with cyberware enhancements.',
  },
};

/**
 * Get all available Shadowrun 6e templates
 */
export function getSR6Templates(): CharacterTemplate[] {
  return [shadowrun6eBlankTemplate, shadowrun6eStreetsamurai];
}

/**
 * Get a specific Shadowrun 6e template by name
 */
export function getSR6Template(templateName?: string): CharacterTemplate {
  if (!templateName || templateName === 'blank') {
    return shadowrun6eBlankTemplate;
  }

  if (templateName === 'streetsamurai') {
    return shadowrun6eStreetsamurai;
  }

  return shadowrun6eBlankTemplate;
}
