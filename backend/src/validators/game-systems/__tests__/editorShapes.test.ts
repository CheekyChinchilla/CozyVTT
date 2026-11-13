/**
 * Everything an editor writes survives the schema.
 *
 * The routes store the schema's parsed sheet. A key the editor writes and the
 * schema does not declare is dropped without an error, and a value the editor
 * can produce but the schema refuses makes every save fail. Both have shipped:
 * Fantasy d20 feat descriptions were dropped, a cleared Background box made
 * a sheet impossible to save.
 *
 * Each sheet below holds every field its editor lets a player fill in, each
 * kind of entry the editor adds, in the shape the editor builds it, and the
 * empty values a cleared box writes. When an editor gains a field, add it here.
 */

import { validateCharacterData } from '../index';
import { GameSystem, type SupportedGameSystem } from '../../../game-systems';
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

function expectKeptWhole(system: SupportedGameSystem, sheet: Sheet): void {
  const result = validateCharacterData(system, sheet);
  if (!result.success) {
    throw new Error(`refused: ${JSON.stringify(result.errors.issues.map((i) => [i.path.join('.'), i.message]))}`);
  }
  expect(droppedKeys(sheet, result.data)).toEqual([]);
}

const blank = (system: SupportedGameSystem): Sheet => getBlankTemplate(system).data as Sheet;
const slots = (ranks: number) =>
  Object.fromEntries(Array.from({ length: ranks }, (_, i) => [String(i + 1), { total: 1, expended: 1 }]));

describe('what the 5E editor writes', () => {
  it('is kept whole', () => {
    const sheet = blank(GameSystem.FIFTH_EDITION);
    const skills = sheet.skills as Record<string, Sheet>;
    const saves = sheet.savingThrows as Record<string, Sheet>;
    expectKeptWhole(GameSystem.FIFTH_EDITION, {
      ...sheet,
      // An other bonus beside the derived one: Jack of All Trades, Aura of
      // Protection, a Ring of Protection.
      skills: { ...skills, stealth: { ...skills.stealth, bonus: 1, otherBonus: 1 } },
      savingThrows: { ...saves, wisdom: { ...saves.wisdom, bonus: 3, otherBonus: 3 } },
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
      initiativeAdvantage: true,
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

describe('what the Fantasy d20 editor writes', () => {
  it('is kept whole', () => {
    const newSpell = { name: 'New Spell', rank: 1, prepared: false, ritual: false, heightened: false };
    expectKeptWhole(GameSystem.FANTASY_D20, {
      ...blank(GameSystem.FANTASY_D20),
      themeColor: 'Golden',
      background: '',
      alignment: '',
      deity: '',
      experiencePoints: 0,
      heroPoints: 1,
      loreSkills: [{ name: 'New Lore', attribute: 'intelligence', proficiencyRank: 'trained', itemBonus: 0, bonus: 0 }],
      // A blank sheet has none; the editor writes this once a key attribute is chosen.
      classDC: { keyAttribute: 'strength', proficiencyRank: 'untrained', total: 10 },
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

// Every field of the Horror d100 sheet, as the editor writes each: the rows
// its add buttons add, and the boxes it fills or clears.
describe('what the Horror d100 editor writes', () => {
  it('is kept whole', () => {
    const sheet = blank(GameSystem.HORROR_D100);
    const rating = { value: 10, experienceCheck: true, notes: 'Learned at sea' };
    expectKeptWhole(GameSystem.HORROR_D100, {
      ...sheet,
      themeColor: '#14532d',
      playerName: 'Robin',
      age: '30',
      sex: '',
      residence: '',
      birthplace: '',
      conditions: { majorWound: true, dying: false, unconscious: false, temporaryInsanity: false },
      skills: {
        ...(sheet.skills as Sheet),
        languageOther: [{ specialty: 'Latin', ...rating }],
        science: [{ specialty: 'Chemistry', ...rating }],
        meleeWeapon: [{ specialty: 'Sword', ...rating }],
        // A specialty as its add button adds it: at its base, with no notes.
        firearm: [{ specialty: 'Shotgun', value: 30, experienceCheck: false }],
        missileWeapon: [{ specialty: '', value: 0, experienceCheck: false }],
        own: [{ name: 'New skill', value: 0, experienceCheck: false }, { name: 'Cryptography', ...rating }],
      },
      // A weapon and a piece of armor as their add buttons add them.
      weapons: [{
        name: 'New Weapon', skill: 'Brawl', skillValue: 25, damage: '1D3+dm', range: 'Short',
        attacks: 1, ammo: null, malfunction: null, notes: '',
      }],
      armor: [{ name: 'New Armor', armorValue: 0, notes: '' }, { name: 'Leather jacket', armorValue: 1, notes: 'Heavy' }],
      hitPoints: { maximum: 10, current: -3 },
      move: 12,
      distinctiveFeatures: ['A crooked smile'],
      spells: ['Ward of Ash'],
      contacts: [{ name: 'Dr Edith Vane', role: 'Librarian', notes: 'Halloway College' }],
      possessions: [{ name: 'Knife', notes: 'sharp - old' }],
      wealth: { level: '', cash: 0, assets: '', notes: 'A trust fund' },
      // A note as its add button adds it, and one whose title was cleared.
      story: [{ title: 'New note', text: '' }, { title: '', text: 'Grew up by the sea.' }],
      appearance: { age: '', height: '', weight: '', eyes: '', hair: '', skin: '' },
      notes: '',
    });
  });
});

// The Horror d100 editor's name boxes can be cleared to retype, and a
// save then must not be refused for the empty name: the sheet lists a
// specialty with no name under its skill's own.
describe('a Horror d100 name box left empty', () => {
  it('is kept', () => {
    const sheet = blank(GameSystem.HORROR_D100);
    const rating = { value: 10, experienceCheck: false };
    const skills = sheet.skills as Sheet;
    expectKeptWhole(GameSystem.HORROR_D100, {
      ...sheet,
      skills: {
        ...skills,
        languageOwn: { ...(skills.languageOwn as Sheet), language: '' },
        languageOther: [{ specialty: '', ...rating }],
        science: [{ specialty: '', ...rating }],
        own: [{ name: '', ...rating }],
      },
      // A contact as the editor adds one, and one whose name was cleared.
      contacts: [{ name: 'New contact', role: '', notes: '' }, { name: '', role: '', notes: '' }],
    });
  });
});
