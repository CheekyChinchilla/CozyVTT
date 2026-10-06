/**
 * A D&D 5e character for editor tests, with every block the editor reads and
 * its derived numbers already correct, so a test can override just the part
 * it is about. Each call returns new objects.
 */

import type { Character } from '../../../../types';

const SKILLS = [
  'acrobatics', 'animalHandling', 'arcana', 'athletics', 'deception', 'history',
  'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception',
  'performance', 'persuasion', 'religion', 'sleightOfHand', 'stealth', 'survival',
];
const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

export const DND5E_SHEET: Record<string, unknown> = {
  characterName: 'Aldra',
  class: 'Fighter',
  level: 1,
  race: 'Human',
  background: 'Soldier',
  alignment: 'Neutral',
  experiencePoints: 0,
  proficiencyBonus: 2,
  stats: Object.fromEntries(ABILITIES.map((a) => [a, { score: 10, modifier: 0 }])),
  savingThrows: Object.fromEntries(ABILITIES.map((a) => [a, { proficient: false, bonus: 0 }])),
  skills: Object.fromEntries(SKILLS.map((s) => [s, { proficient: false, expertise: false, bonus: 0 }])),
  armorClass: 10,
  initiative: 0,
  initiativeBonus: 0,
  speed: 30,
  hp: { maximum: 12, current: 12, temporary: 0 },
  hitDice: [{ class: 'Fighter', die: 'd10', maximum: 1, remaining: 1 }],
  deathSaves: { successes: 0, failures: 0 },
  passivePerception: 10,
  passivePerceptionBonus: 0,
  attacks: [],
  inventory: [
    { name: 'Rope', quantity: 1, weight: 10, notes: '', equippable: false, equipped: false, requiresAttunement: false, attuned: false, value: 1 },
  ],
  currency: { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 },
  conditions: [],
  featuresAndTraits: [],
  proficiencies: { armor: '', weapons: '', tools: '', languages: 'Common' },
  proficienciesAndLanguages: ['Common'],
  appearance: {},
  personality: {},
  alliesAndOrganizations: { name: '', description: '' },
  backstory: '',
  themeColor: 'Classic Red',
};

export function dnd5eCharacter(overrides: Record<string, unknown> = {}): Character {
  const data: Record<string, unknown> = JSON.parse(JSON.stringify(DND5E_SHEET));
  return {
    id: 'char-1',
    userId: 'user-1',
    name: 'Aldra',
    gameSystem: 'DND_5E',
    campaignId: null,
    tokenImageUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    data: { ...data, ...overrides },
  } as unknown as Character;
}
