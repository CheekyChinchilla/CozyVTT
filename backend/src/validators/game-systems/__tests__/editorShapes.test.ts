/**
 * Everything an editor writes survives the schema.
 *
 * The routes store the schema's parsed sheet. A key the editor writes and the
 * schema does not declare is dropped without an error, and a value the editor
 * can produce but the schema refuses makes every save fail. Both have shipped:
 * Pathfinder 2e feat descriptions were dropped, a cleared Background box made
 * a sheet impossible to save.
 *
 * Each sheet below holds every field its editor lets a player fill in, each
 * kind of entry the editor adds, in the shape the editor builds it, and the
 * empty values a cleared box writes. When an editor gains a field, add it here.
 */

import { validateCharacterData } from '../index';
import { GameSystem } from '../../../game-systems';
import { getBlankTemplate } from '../../../utils/character-templates';

type Sheet = Record<string, unknown>;

/** Paths of keys present in `input` and missing from what the schema returned. */
function droppedKeys(input: unknown, output: unknown, path = ''): string[] {
  if (Array.isArray(input) && Array.isArray(output)) {
    return input.flatMap((entry, i) => droppedKeys(entry, output[i], `${path}[${i}]`));
  }
  if (input && typeof input === 'object' && !Array.isArray(input) && output && typeof output === 'object') {
    const out = output as Record<string, unknown>;
    return Object.entries(input as Record<string, unknown>).flatMap(([key, value]) =>
      key in out ? droppedKeys(value, out[key], `${path}.${key}`) : [`${path}.${key}`]
    );
  }
  return [];
}

function expectKeptWhole(system: GameSystem, sheet: Sheet): void {
  const result = validateCharacterData(system, sheet);
  if (!result.success) {
    throw new Error(`refused: ${JSON.stringify(result.errors.issues.map((i) => [i.path.join('.'), i.message]))}`);
  }
  expect(droppedKeys(sheet, result.data)).toEqual([]);
}

const blank = (system: GameSystem): Sheet => getBlankTemplate(system).data as Sheet;
const slots = (ranks: number) =>
  Object.fromEntries(Array.from({ length: ranks }, (_, i) => [String(i + 1), { total: 1, expended: 1 }]));

describe('what the D&D 5e editor writes', () => {
  it('is kept whole', () => {
    expectKeptWhole(GameSystem.DND_5E, {
      ...blank(GameSystem.DND_5E),
      themeColor: '#aabbcc',
      background: '',
      alignment: '',
      experiencePoints: 0,
      inspiration: true,
      customSkills: [{ name: '', ability: 'dexterity', proficient: true, expertise: false, otherBonus: 1 }],
      passivePerception: 10,
      passivePerceptionBonus: 0,
      armorClass: 10,
      speed: 30,
      initiative: 0,
      initiativeBonus: 0,
      hp: { maximum: 10, current: 10, temporary: 0 },
      hitDice: [{ class: 'Fighter', die: 'd6', maximum: 1, remaining: 1 }],
      deathSaves: { successes: 0, failures: 0 },
      conditions: ['poisoned'],
      exhaustionLevel: 1,
      attacks: [{
        name: 'Spear', attackBonus: 0, damageRoll: '1d6', damageType: 'piercing', range: 20,
        properties: ['thrown'], notes: '',
        additionalDamage: [{ label: 'Two hands', damageRoll: '1d8', damageType: 'piercing' }],
      }],
      spellcasting: {
        class: '', ability: '', spellSaveDC: 8, spellAttackBonus: 0,
        spellSaveDCOtherBonus: 0, spellAttackOtherBonus: 0,
        cantrips: ['Light'], slots: slots(9),
        spells: [{ level: 1, name: 'Shield', prepared: false, ritual: false, concentration: false }],
      },
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      inventory: [{
        name: 'Rope', quantity: 1, weight: 0, notes: '', equippable: false, equipped: false,
        requiresAttunement: false, attuned: false, value: 0,
      }],
      proficiencies: { armor: '', weapons: '', tools: '', languages: 'Common' },
      proficienciesAndLanguages: ['Common'],
      featuresAndTraits: [{ name: 'Second Wind', description: '' }],
      additionalFeaturesAndTraits: '',
      appearance: { age: '', height: '', weight: '', eyes: '', skin: '', hair: '' },
      personality: { traits: '', ideals: '', bonds: '', flaws: '' },
      backstory: '',
      alliesAndOrganizations: { name: '', description: '' },
      treasure: '',
    });
  });
});

describe('what the Pathfinder 2e editor writes', () => {
  it('is kept whole', () => {
    const newSpell = { name: 'New Spell', rank: 1, prepared: false, ritual: false, heightened: false };
    expectKeptWhole(GameSystem.PATHFINDER_2E, {
      ...blank(GameSystem.PATHFINDER_2E),
      themeColor: 'Golden',
      background: '',
      alignment: '',
      deity: '',
      experiencePoints: 0,
      heroPoints: 1,
      loreSkills: [{ name: 'New Lore', attribute: 'intelligence', proficiencyRank: 'trained', itemBonus: 0, bonus: 0 }],
      deathAndDying: { dying: 0, wounded: 0, doomed: 0 },
      conditions: ['frightened'],
      proficiencies: {
        weapons: { simple: 'trained', martial: 'untrained', advanced: 'untrained', unarmed: 'trained' },
        armor: { unarmored: 'trained', light: 'untrained', medium: 'untrained', heavy: 'untrained' },
      },
      strikes: [{
        name: 'New Attack', type: 'melee', attackBonus: 0, damageRoll: '1d6', damageType: 'bludgeoning',
        attributeModifier: 'strength', proficiencyRank: 'trained', itemBonus: 0, traits: [], range: null, notes: '',
      }],
      inventory: [{
        name: 'New Item', quantity: 1, bulk: 'L', equippable: false, equipped: false,
        requiresAttunement: false, attuned: false, invested: false, value: 0, notes: '',
      }],
      feats: {
        ancestryAndHeritage: [],
        class: [{ name: 'New Feat', level: 1, description: '' }],
        skill: [],
        general: [],
        bonus: [],
      },
      classFeatures: [{ name: 'Shield Block', description: '' }],
      spellcasting: {
        tradition: 'arcane',
        type: 'prepared',
        keyAttribute: 'intelligence',
        spellAttackBonus: { proficiencyRank: 'trained', itemBonus: 0, bonus: 0 },
        spellDC: { proficiencyRank: 'trained', itemBonus: 0, dc: 10 },
        cantrips: [{ name: 'New Cantrip', rank: 1, prepared: false }],
        slots: slots(10),
        spells: [newSpell],
        focusSpells: { focusPoints: { total: 3, current: 1 }, spells: [{ ...newSpell, name: 'New Focus Spell' }] },
        innateSpells: [{ name: 'New Innate Spell', tradition: 'arcane', frequency: '' }],
        rituals: [{ name: 'New Ritual', rank: 1 }],
      },
      languages: ['Common'],
      appearance: { age: '', height: '', weight: '', eyes: '', skin: '', hair: '' },
      personality: { traits: '', ideals: '', bonds: '', flaws: '' },
      backstory: '',
      alliesAndOrganizations: { name: '', description: '' },
      notes: '',
      treasure: '',
    });
  });
});

describe('what the Call of Cthulhu 7e editor writes', () => {
  it('is kept whole', () => {
    const sheet = blank(GameSystem.CALL_OF_CTHULHU_7E);
    const skill = { baseValue: 1, currentValue: 10, improvementChecked: true };
    expectKeptWhole(GameSystem.CALL_OF_CTHULHU_7E, {
      ...sheet,
      themeColor: '#14532d',
      age: '30',
      sex: '',
      residence: '',
      birthplace: '',
      conditions: { majorWound: true, dying: false, unconscious: false, temporaryInsanity: false, indefiniteInsanity: false },
      skills: {
        ...(sheet.skills as Sheet),
        languageOther: [{ language: 'Latin', ...skill }],
        science: [{ specialization: 'Chemistry', ...skill }],
        customSkills: [{ name: 'Cryptography', ...skill }],
      },
      combat: {
        weapons: [{
          name: 'New Weapon', skill: '', skillValue: 25, damage: '1d3', range: 'Touch',
          attacks: 1, ammo: null, malfunction: null, notes: '',
        }],
      },
      possessions: [{ name: 'Knife', notes: 'sharp - old' }],
      wealth: { spendingLevel: '', cash: 0, assets: '' },
      backstory: {
        description: '', personalDescription: '', ideology: '', significantPeople: '', meaningfulLocations: '',
        treasuredPossessions: '', traits: '', injuriesAndScars: '', phobiasAndManias: '',
        arcaneTomesAndSpells: '', encountersWithStrangeEntities: '',
      },
      appearance: { age: '', height: '', weight: '', eyes: '', hair: '', skin: '' },
      spellsAndMythos: { cthulhuMythos: 0, spells: ['Elder Sign'] },
      notes: '',
    });
  });
});
