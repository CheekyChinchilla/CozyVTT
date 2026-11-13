/**
 * Every list a character sheet stores has a count limit.
 *
 * Only the 1 MB request body limited them, so a player could store tens of
 * thousands of inventory rows, spells or attacks, and every member of the
 * campaign who opened the sheet drew them all. The walk fails for any list a
 * sheet schema accepts without a maximum, so a list added later cannot go
 * without one.
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { GameSystem, type SupportedGameSystem } from '../../../game-systems';
import {
  getBlankCharacterTemplate,
  validateCharacterData,
  fifthEditionCharacterDataSchema,
  fantasyD20CharacterDataSchema,
  HorrorD100SheetSchema,
  flexibleCharacterDataSchema,
} from '../index';
import { unboundedLists } from '../../../__tests__/helpers/sheetSchemaWalk';
import { HORROR_D100_SPECIALISED_SKILLS } from '../../../utils/rules/horrorD100';
import {
  FANTASY_D20_ITEM_BONUS_MAX,
  FANTASY_D20_ITEM_BONUS_MIN,
  HORROR_D100_FIREARM_LIST_MAX,
  HORROR_D100_OWN_SKILL_LIST_MAX,
  SHEET_LIST_MAX,
  SHEET_ROW_TAGS_MAX,
  SPELL_SLOTS_MAX,
} from '../sheetLimits';

describe('every list on a sheet', () => {
  it.each([
    ['FIFTH_EDITION', fifthEditionCharacterDataSchema],
    ['FANTASY_D20', fantasyD20CharacterDataSchema],
    // The conversion record is the server's: written when a sheet is
    // converted, kept on every save, and never taken from a request. It holds
    // lists copied from an older sheet, so it has no limit of its own.
    ['HORROR_D100', HorrorD100SheetSchema.omit({ converted: true })],
    ['Flexible', flexibleCharacterDataSchema],
  ] as Array<[string, z.ZodType]>)('has a count limit in %s', (_system, schema) => {
    expect(unboundedLists(schema)).toEqual([]);
  });
});

/** The issues a sheet is refused with, as `path: message` lines. */
function refusals(system: SupportedGameSystem, data: unknown): string[] {
  const result = validateCharacterData(system, data);
  return result.success ? [] : result.errors.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

const blank = (system: SupportedGameSystem) => getBlankCharacterTemplate(system) as Record<string, unknown>;
const rows = (count: number, row: unknown) => Array.from({ length: count }, () => row);

describe('the 5E lists', () => {
  const sheet = (fields: Record<string, unknown>) => ({ ...blank(GameSystem.FIFTH_EDITION), ...fields });
  const item = { name: 'Rope' };
  const named = (name: string) => ({ name, attackBonus: 0 });

  it.each([
    ['inventory', rows(SHEET_LIST_MAX + 1, item)],
    ['attacks', rows(SHEET_LIST_MAX + 1, named('Dagger'))],
    ['hitDice', rows(SHEET_LIST_MAX + 1, { class: 'Fighter', remaining: 1 })],
    ['conditions', rows(SHEET_LIST_MAX + 1, 'prone')],
    ['featuresAndTraits', rows(SHEET_LIST_MAX + 1, 'Second Wind')],
    ['proficienciesAndLanguages', rows(SHEET_LIST_MAX + 1, 'Common')],
    ['proficiencies', rows(SHEET_LIST_MAX + 1, 'Common')],
  ])('refuse %s past the limit, naming the list', (field, list) => {
    expect(refusals(GameSystem.FIFTH_EDITION, sheet({ [field]: list }))).toEqual([
      `${field}: Can hold at most ${SHEET_LIST_MAX} entries`,
    ]);
  });

  it('refuse spells and cantrips past the limit, naming the list', () => {
    const spell = { level: 1, name: 'Shield', prepared: true, ritual: false, concentration: false };
    expect(
      refusals(GameSystem.FIFTH_EDITION, sheet({ spellcasting: { spells: rows(SHEET_LIST_MAX + 1, spell) } }))
    ).toEqual([`spellcasting.spells: Can hold at most ${SHEET_LIST_MAX} entries`]);
    expect(
      refusals(GameSystem.FIFTH_EDITION, sheet({ spellcasting: { cantrips: rows(SHEET_LIST_MAX + 1, 'Light') } }))
    ).toEqual([`spellcasting.cantrips: Can hold at most ${SHEET_LIST_MAX} entries`]);
  });

  it('take every list at the limit', () => {
    const spell = { level: 1, name: 'Shield', prepared: true, ritual: false, concentration: false };
    expect(
      refusals(
        GameSystem.FIFTH_EDITION,
        sheet({
          inventory: rows(SHEET_LIST_MAX, item),
          attacks: rows(SHEET_LIST_MAX, named('Dagger')),
          hitDice: rows(SHEET_LIST_MAX, { class: 'Fighter', remaining: 1 }),
          conditions: rows(SHEET_LIST_MAX, 'prone'),
          featuresAndTraits: rows(SHEET_LIST_MAX, 'Second Wind'),
          proficienciesAndLanguages: rows(SHEET_LIST_MAX, 'Common'),
          spellcasting: { spells: rows(SHEET_LIST_MAX, spell), cantrips: rows(SHEET_LIST_MAX, 'Light') },
        })
      )
    ).toEqual([]);
  });
});

/** A copy of `sheet` with `value` set at `path`, making the objects on the way. */
function setAt(sheet: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const [head, ...rest] = path.split('.');
  if (rest.length === 0) return { ...sheet, [head]: value };
  const inner = (sheet[head] ?? {}) as Record<string, unknown>;
  return { ...sheet, [head]: setAt(inner, rest.join('.'), value) };
}

describe('the Fantasy d20 lists', () => {
  const sheet = (path: string, value: unknown) => {
    const withList = setAt(blank(GameSystem.FANTASY_D20), path, value);
    // Focus spells come with their points.
    return path.startsWith('spellcasting.focusSpells')
      ? setAt(withList, 'spellcasting.focusSpells.focusPoints', { total: 1, current: 1 })
      : withList;
  };
  const spell = { rank: 1, name: 'Shield', prepared: true, ritual: false, heightened: false };
  const lore = { name: 'Warfare', attribute: 'intelligence', proficiencyRank: 'trained', itemBonus: 0, bonus: 0 };
  const named = { name: 'Rope' };

  /** Every list on a Fantasy d20 sheet, with an entry that is valid in it. */
  const lists: Array<[string, unknown]> = [
    ['perception.senses', 'darkvision'],
    ['loreSkills', lore],
    ['speed.other', 'fly 30 ft.'],
    ['hp.resistances', 'fire 5'],
    ['hp.immunities', 'poison'],
    ['hp.weaknesses', 'cold 5'],
    ['conditions', 'frightened'],
    ['strikes', named],
    ['inventory', named],
    ['languages', 'Common'],
    ['feats.ancestryAndHeritage', named],
    ['feats.class', named],
    ['feats.skill', named],
    ['feats.general', named],
    ['feats.bonus', named],
    ['classFeatures', 'Shield Block'],
    ['spellcasting.cantrips', { rank: 1, name: 'Light', prepared: true }],
    ['spellcasting.spells', spell],
    ['spellcasting.focusSpells.spells', spell],
    ['spellcasting.innateSpells', named],
    ['spellcasting.rituals', 'Marvelous Mount'],
  ];

  it('are all of them tried here', () => {
    // The walk finds 22: the 21 above, and the traits inside a strike.
    expect(lists).toHaveLength(21);
  });

  it.each(lists)('refuse %s past the limit, naming the list', (path, entry) => {
    expect(refusals(GameSystem.FANTASY_D20, sheet(path, rows(SHEET_LIST_MAX + 1, entry)))).toEqual([
      `${path}: Can hold at most ${SHEET_LIST_MAX} entries`,
    ]);
  });

  it.each(lists)('take %s at the limit', (path, entry) => {
    expect(refusals(GameSystem.FANTASY_D20, sheet(path, rows(SHEET_LIST_MAX, entry)))).toEqual([]);
  });

  it(`refuse more than ${SHEET_ROW_TAGS_MAX} traits on one strike`, () => {
    const strike = (count: number) => [{ name: 'Sword', traits: rows(count, 'agile') }];
    expect(refusals(GameSystem.FANTASY_D20, sheet('strikes', strike(SHEET_ROW_TAGS_MAX + 1)))).toEqual([
      `strikes.0.traits: Can hold at most ${SHEET_ROW_TAGS_MAX} entries`,
    ]);
    expect(refusals(GameSystem.FANTASY_D20, sheet('strikes', strike(SHEET_ROW_TAGS_MAX)))).toEqual([]);
  });
});

describe('the Fantasy d20 item bonuses', () => {
  const sheet = (path: string, value: unknown) => setAt(blank(GameSystem.FANTASY_D20), path, value);
  const message = `Must be from ${FANTASY_D20_ITEM_BONUS_MIN} to ${FANTASY_D20_ITEM_BONUS_MAX}`;
  const lore = { name: 'Warfare', attribute: 'intelligence', proficiencyRank: 'trained', bonus: 0 };
  const strike = { name: 'Sword' };

  /** Each place an item bonus is stored, with the sheet fragment that holds it. */
  const places: Array<[string, (bonus: number) => Record<string, unknown>]> = [
    ['savingThrows.fortitude.itemBonus', (itemBonus) => sheet('savingThrows.fortitude.itemBonus', itemBonus)],
    ['savingThrows.reflex.itemBonus', (itemBonus) => sheet('savingThrows.reflex.itemBonus', itemBonus)],
    ['savingThrows.will.itemBonus', (itemBonus) => sheet('savingThrows.will.itemBonus', itemBonus)],
    ['perception.itemBonus', (itemBonus) => sheet('perception.itemBonus', itemBonus)],
    ['skills.stealth.itemBonus', (itemBonus) => sheet('skills.stealth.itemBonus', itemBonus)],
    ['loreSkills.0.itemBonus', (itemBonus) => sheet('loreSkills', [{ ...lore, itemBonus }])],
    ['armorClass.itemBonus', (itemBonus) => sheet('armorClass.itemBonus', itemBonus)],
    ['strikes.0.itemBonus', (itemBonus) => sheet('strikes', [{ ...strike, itemBonus }])],
    [
      'spellcasting.spellAttackBonus.itemBonus',
      (itemBonus) => sheet('spellcasting', { spellAttackBonus: { proficiencyRank: 'trained', itemBonus, bonus: 0 } }),
    ],
    [
      'spellcasting.spellDC.itemBonus',
      (itemBonus) => sheet('spellcasting', { spellDC: { proficiencyRank: 'trained', itemBonus, dc: 10 } }),
    ],
  ];

  it.each(places)('%s is refused past the range, in either direction', (path, withBonus) => {
    expect(refusals(GameSystem.FANTASY_D20, withBonus(FANTASY_D20_ITEM_BONUS_MAX + 1))).toEqual([`${path}: ${message}`]);
    expect(refusals(GameSystem.FANTASY_D20, withBonus(FANTASY_D20_ITEM_BONUS_MIN - 1))).toEqual([`${path}: ${message}`]);
    expect(refusals(GameSystem.FANTASY_D20, withBonus(5_000_000))).toEqual([`${path}: ${message}`]);
  });

  it.each(places)('%s takes the ends of the range', (_path, withBonus) => {
    expect(refusals(GameSystem.FANTASY_D20, withBonus(FANTASY_D20_ITEM_BONUS_MAX))).toEqual([]);
    expect(refusals(GameSystem.FANTASY_D20, withBonus(FANTASY_D20_ITEM_BONUS_MIN))).toEqual([]);
    expect(refusals(GameSystem.FANTASY_D20, withBonus(4))).toEqual([]);
  });
});

describe('the Fantasy d20 spell slots', () => {
  const withSlot = (slot: Record<string, number>) => {
    const slots = Object.fromEntries(
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map((rank) => [rank, { total: 0, expended: 0 }])
    );
    return setAt(blank(GameSystem.FANTASY_D20), 'spellcasting', { slots: { ...slots, '3': slot } });
  };

  it('refuse a total of 5,000,000, naming the rank', () => {
    expect(refusals(GameSystem.FANTASY_D20, withSlot({ total: 5_000_000, expended: 0 }))).toEqual([
      `spellcasting.slots.3.total: Must be from 0 to ${SPELL_SLOTS_MAX}`,
    ]);
  });

  it(`refuse a total of ${SPELL_SLOTS_MAX + 1}, and more than ${SPELL_SLOTS_MAX} used`, () => {
    expect(refusals(GameSystem.FANTASY_D20, withSlot({ total: SPELL_SLOTS_MAX + 1, expended: 0 }))).toEqual([
      `spellcasting.slots.3.total: Must be from 0 to ${SPELL_SLOTS_MAX}`,
    ]);
    // Also more used than the 4 there are, which is refused on its own.
    expect(refusals(GameSystem.FANTASY_D20, withSlot({ total: 4, expended: SPELL_SLOTS_MAX + 1 }))).toEqual([
      `spellcasting.slots.3.expended: Must be from 0 to ${SPELL_SLOTS_MAX}`,
      'spellcasting.slots.3.expended: Used slots cannot be more than the total',
    ]);
  });

  it(`take ${SPELL_SLOTS_MAX} slots, all used, and no slots`, () => {
    expect(refusals(GameSystem.FANTASY_D20, withSlot({ total: SPELL_SLOTS_MAX, expended: SPELL_SLOTS_MAX }))).toEqual([]);
    expect(refusals(GameSystem.FANTASY_D20, withSlot({ total: 0, expended: 0 }))).toEqual([]);
  });
});

describe('the Horror d100 lists', () => {
  const sheet = (path: string, value: unknown) => setAt(blank(GameSystem.HORROR_D100), path, value);
  const rating = { value: 20, experienceCheck: false };
  const named = { name: 'Revolver' };

  // A sheet converted from the shape before 1.7.0 can hold more firearms
  // and skills of its own than other lists take, and must still save.
  const limitOf = (path: string) =>
    path === 'skills.firearm' ? HORROR_D100_FIREARM_LIST_MAX : path === 'skills.own' ? HORROR_D100_OWN_SKILL_LIST_MAX : SHEET_LIST_MAX;

  /** Every list on a Horror d100 sheet, with an entry that is valid in it. */
  const lists: Array<[string, unknown]> = [
    ...Object.keys(HORROR_D100_SPECIALISED_SKILLS).map((key): [string, unknown] => [`skills.${key}`, { ...rating, specialty: 'Any' }]),
    ['skills.own', { ...rating, name: 'Spelunking' }],
    ['weapons', named],
    ['armor', { name: 'Leather jacket' }],
    ['distinctiveFeatures', 'A crooked smile'],
    ['spells', 'Call the Grey Lantern'],
    ['possessions', named],
    ['story', { title: 'Background', text: 'Grew up by the sea.' }],
    ['contacts', { name: 'Dr Vane' }],
  ];

  it('are all of them tried here', () => {
    expect(lists).toHaveLength(Object.keys(HORROR_D100_SPECIALISED_SKILLS).length + 8);
  });

  it.each(lists)('refuse %s past the limit, naming the list', (path, entry) => {
    const max = limitOf(path);
    expect(refusals(GameSystem.HORROR_D100, sheet(path, rows(max + 1, entry)))).toEqual([
      `${path}: Can hold at most ${max} entries`,
    ]);
  });

  it.each(lists)('take %s at the limit', (path, entry) => {
    expect(refusals(GameSystem.HORROR_D100, sheet(path, rows(limitOf(path), entry)))).toEqual([]);
  });

  it('take three more firearms and four more skills of the character\'s own than other lists', () => {
    expect([HORROR_D100_FIREARM_LIST_MAX, HORROR_D100_OWN_SKILL_LIST_MAX]).toEqual([SHEET_LIST_MAX + 3, SHEET_LIST_MAX + 4]);
  });
});
