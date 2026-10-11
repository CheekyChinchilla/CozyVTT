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
import { GameSystem } from '../../../game-systems';
import {
  getBlankCharacterTemplate,
  validateCharacterData,
  dnd5eCharacterDataSchema,
  pathfinder2eCharacterDataSchema,
  callOfCthulhu7eCharacterDataSchema,
  flexibleCharacterDataSchema,
} from '../index';
import { unboundedLists } from '../../../__tests__/helpers/sheetSchemaWalk';
import {
  PF2E_ITEM_BONUS_MAX,
  PF2E_ITEM_BONUS_MIN,
  SHEET_LIST_MAX,
  SHEET_ROW_TAGS_MAX,
  SPELL_SLOTS_MAX,
} from '../sheetLimits';

describe('every list on a sheet', () => {
  it.each([
    ['DND_5E', dnd5eCharacterDataSchema],
    ['PATHFINDER_2E', pathfinder2eCharacterDataSchema],
    ['CALL_OF_CTHULHU_7E', callOfCthulhu7eCharacterDataSchema],
    ['Flexible', flexibleCharacterDataSchema],
  ] as Array<[string, z.ZodType]>)('has a count limit in %s', (_system, schema) => {
    expect(unboundedLists(schema)).toEqual([]);
  });
});

/** The issues a sheet is refused with, as `path: message` lines. */
function refusals(system: GameSystem, data: unknown): string[] {
  const result = validateCharacterData(system, data);
  return result.success ? [] : result.errors.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

const blank = (system: GameSystem) => getBlankCharacterTemplate(system) as Record<string, unknown>;
const rows = (count: number, row: unknown) => Array.from({ length: count }, () => row);

describe('the D&D 5e lists', () => {
  const sheet = (fields: Record<string, unknown>) => ({ ...blank(GameSystem.DND_5E), ...fields });
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
    expect(refusals(GameSystem.DND_5E, sheet({ [field]: list }))).toEqual([
      `${field}: Can hold at most ${SHEET_LIST_MAX} entries`,
    ]);
  });

  it('refuse spells and cantrips past the limit, naming the list', () => {
    const spell = { level: 1, name: 'Shield', prepared: true, ritual: false, concentration: false };
    expect(
      refusals(GameSystem.DND_5E, sheet({ spellcasting: { spells: rows(SHEET_LIST_MAX + 1, spell) } }))
    ).toEqual([`spellcasting.spells: Can hold at most ${SHEET_LIST_MAX} entries`]);
    expect(
      refusals(GameSystem.DND_5E, sheet({ spellcasting: { cantrips: rows(SHEET_LIST_MAX + 1, 'Light') } }))
    ).toEqual([`spellcasting.cantrips: Can hold at most ${SHEET_LIST_MAX} entries`]);
  });

  it('take every list at the limit', () => {
    const spell = { level: 1, name: 'Shield', prepared: true, ritual: false, concentration: false };
    expect(
      refusals(
        GameSystem.DND_5E,
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

describe('the Pathfinder 2e lists', () => {
  const sheet = (path: string, value: unknown) => {
    const withList = setAt(blank(GameSystem.PATHFINDER_2E), path, value);
    // Focus spells come with their points.
    return path.startsWith('spellcasting.focusSpells')
      ? setAt(withList, 'spellcasting.focusSpells.focusPoints', { total: 1, current: 1 })
      : withList;
  };
  const spell = { rank: 1, name: 'Shield', prepared: true, ritual: false, heightened: false };
  const lore = { name: 'Warfare', attribute: 'intelligence', proficiencyRank: 'trained', itemBonus: 0, bonus: 0 };
  const named = { name: 'Rope' };

  /** Every list on a Pathfinder 2e sheet, with an entry that is valid in it. */
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
    expect(refusals(GameSystem.PATHFINDER_2E, sheet(path, rows(SHEET_LIST_MAX + 1, entry)))).toEqual([
      `${path}: Can hold at most ${SHEET_LIST_MAX} entries`,
    ]);
  });

  it.each(lists)('take %s at the limit', (path, entry) => {
    expect(refusals(GameSystem.PATHFINDER_2E, sheet(path, rows(SHEET_LIST_MAX, entry)))).toEqual([]);
  });

  it(`refuse more than ${SHEET_ROW_TAGS_MAX} traits on one strike`, () => {
    const strike = (count: number) => [{ name: 'Sword', traits: rows(count, 'agile') }];
    expect(refusals(GameSystem.PATHFINDER_2E, sheet('strikes', strike(SHEET_ROW_TAGS_MAX + 1)))).toEqual([
      `strikes.0.traits: Can hold at most ${SHEET_ROW_TAGS_MAX} entries`,
    ]);
    expect(refusals(GameSystem.PATHFINDER_2E, sheet('strikes', strike(SHEET_ROW_TAGS_MAX)))).toEqual([]);
  });
});

describe('the Pathfinder 2e item bonuses', () => {
  const sheet = (path: string, value: unknown) => setAt(blank(GameSystem.PATHFINDER_2E), path, value);
  const message = `Must be from ${PF2E_ITEM_BONUS_MIN} to ${PF2E_ITEM_BONUS_MAX}`;
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
    expect(refusals(GameSystem.PATHFINDER_2E, withBonus(PF2E_ITEM_BONUS_MAX + 1))).toEqual([`${path}: ${message}`]);
    expect(refusals(GameSystem.PATHFINDER_2E, withBonus(PF2E_ITEM_BONUS_MIN - 1))).toEqual([`${path}: ${message}`]);
    expect(refusals(GameSystem.PATHFINDER_2E, withBonus(5_000_000))).toEqual([`${path}: ${message}`]);
  });

  it.each(places)('%s takes the ends of the range', (_path, withBonus) => {
    expect(refusals(GameSystem.PATHFINDER_2E, withBonus(PF2E_ITEM_BONUS_MAX))).toEqual([]);
    expect(refusals(GameSystem.PATHFINDER_2E, withBonus(PF2E_ITEM_BONUS_MIN))).toEqual([]);
    expect(refusals(GameSystem.PATHFINDER_2E, withBonus(4))).toEqual([]);
  });
});

describe('the Pathfinder 2e spell slots', () => {
  const withSlot = (slot: Record<string, number>) => {
    const slots = Object.fromEntries(
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map((rank) => [rank, { total: 0, expended: 0 }])
    );
    return setAt(blank(GameSystem.PATHFINDER_2E), 'spellcasting', { slots: { ...slots, '3': slot } });
  };

  it('refuse a total of 5,000,000, naming the rank', () => {
    expect(refusals(GameSystem.PATHFINDER_2E, withSlot({ total: 5_000_000, expended: 0 }))).toEqual([
      `spellcasting.slots.3.total: Must be from 0 to ${SPELL_SLOTS_MAX}`,
    ]);
  });

  it(`refuse a total of ${SPELL_SLOTS_MAX + 1}, and more than ${SPELL_SLOTS_MAX} used`, () => {
    expect(refusals(GameSystem.PATHFINDER_2E, withSlot({ total: SPELL_SLOTS_MAX + 1, expended: 0 }))).toEqual([
      `spellcasting.slots.3.total: Must be from 0 to ${SPELL_SLOTS_MAX}`,
    ]);
    expect(refusals(GameSystem.PATHFINDER_2E, withSlot({ total: 4, expended: SPELL_SLOTS_MAX + 1 }))).toEqual([
      `spellcasting.slots.3.expended: Must be from 0 to ${SPELL_SLOTS_MAX}`,
    ]);
  });

  it(`take ${SPELL_SLOTS_MAX} slots, all used, and no slots`, () => {
    expect(refusals(GameSystem.PATHFINDER_2E, withSlot({ total: SPELL_SLOTS_MAX, expended: SPELL_SLOTS_MAX }))).toEqual([]);
    expect(refusals(GameSystem.PATHFINDER_2E, withSlot({ total: 0, expended: 0 }))).toEqual([]);
  });
});

describe('the Call of Cthulhu lists', () => {
  const sheet = (path: string, value: unknown) => setAt(blank(GameSystem.CALL_OF_CTHULHU_7E), path, value);
  const skill = { baseValue: 20, currentValue: 20, improvementChecked: false };
  const named = { name: 'Revolver' };

  /** Every list on a Call of Cthulhu sheet, with an entry that is valid in it. */
  const lists: Array<[string, unknown]> = [
    ['skills.fighting.custom', skill],
    ['skills.firearms.custom', skill],
    ['skills.languageOther', { ...skill, language: 'Latin' }],
    ['skills.science', { ...skill, specialization: 'Botany' }],
    ['skills.customSkills', { ...skill, name: 'Spelunking' }],
    ['combat.weapons', named],
    ['spellsAndMythos.spells', 'Contact Nyarlathotep'],
    ['pulpTalents', 'Hardy'],
    ['possessions', named],
    ['contacts', { name: 'Dr Armitage' }],
  ];

  it('are all of them tried here', () => {
    expect(lists).toHaveLength(10);
  });

  it.each(lists)('refuse %s past the limit, naming the list', (path, entry) => {
    expect(refusals(GameSystem.CALL_OF_CTHULHU_7E, sheet(path, rows(SHEET_LIST_MAX + 1, entry)))).toEqual([
      `${path}: Can hold at most ${SHEET_LIST_MAX} entries`,
    ]);
  });

  it.each(lists)('take %s at the limit', (path, entry) => {
    expect(refusals(GameSystem.CALL_OF_CTHULHU_7E, sheet(path, rows(SHEET_LIST_MAX, entry)))).toEqual([]);
  });
});
