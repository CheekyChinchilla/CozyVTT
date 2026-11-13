/**
 * The rebuilt Horror d100 sheet's schema: what it takes and keeps, the open
 * d100 rules' characteristics with CHA and an optional EDU, every skill
 * rating from 0 up, and the conversion record a sheet carries once it is
 * converted from the shape before 1.7.0.
 */

import fs from 'fs';
import path from 'path';
import { HorrorD100SheetSchema } from '../horrorD100Sheet.schema';
import { HORROR_D100_VALUE_MAX, SHEET_LIST_MAX, SHEET_LONG_TEXT_MAX } from '../sheetLimits';
import { horrorD100NewSkills } from '../../../utils/rules/horrorD100';

const characteristics = { STR: 12, CON: 11, SIZ: 13, INT: 14, POW: 12, DEX: 14, CHA: 11 };

function newSheet(): Record<string, unknown> {
  return { characterName: 'Ada Brennan', profession: 'Detective', era: 'Modern', characteristics: { ...characteristics } };
}

const conversion = {
  from: 1,
  at: '2026-11-12T00:00:00.000Z',
  characteristics: { STR: 60, CON: 55, SIZ: 65, INT: 70, POW: 60, DEX: 70, CHA: 55, EDU: 65 },
  luck: 55,
  hitPoints: { maximum: 12, current: 9 },
  powerPoints: { maximum: 12, current: 12 },
  sanity: { starting: 60, maximum: 99, current: 58 },
  damageModifier: '+1d4',
  build: 1,
  move: 8,
  skills: [{ name: 'Spot', value: 65 }, { name: 'Locksmith', value: 45 }],
  kept: [],
};

describe('the rebuilt Horror d100 sheet', () => {
  it('takes a new character with the seven characteristics, and EDU when the sheet uses it', () => {
    expect(HorrorD100SheetSchema.safeParse(newSheet()).success).toBe(true);
    const withEdu = { ...newSheet(), characteristics: { ...characteristics, EDU: 16 } };
    expect(HorrorD100SheetSchema.parse(withEdu).characteristics.EDU).toBe(16);
  });

  it('needs a name, a profession, an era and each of the seven characteristics', () => {
    for (const key of ['characterName', 'profession', 'era', 'characteristics']) {
      const { [key]: _left, ...rest } = newSheet();
      expect(HorrorD100SheetSchema.safeParse(rest).success).toBe(false);
    }
    const { CHA: _cha, ...noCha } = characteristics;
    expect(HorrorD100SheetSchema.safeParse({ ...newSheet(), characteristics: noCha }).success).toBe(false);
  });

  it('keeps a characteristic below the open range, and refuses one below 0 or past the limit', () => {
    expect(HorrorD100SheetSchema.safeParse({ ...newSheet(), characteristics: { ...characteristics, SIZ: 2, INT: 0 } }).success).toBe(true);
    expect(HorrorD100SheetSchema.safeParse({ ...newSheet(), characteristics: { ...characteristics, STR: -1 } }).success).toBe(false);
    expect(HorrorD100SheetSchema.safeParse({ ...newSheet(), characteristics: { ...characteristics, POW: HORROR_D100_VALUE_MAX + 1 } }).success).toBe(false);
  });

  it('takes every skill rating from 0 up, below its base too', () => {
    const skills = horrorD100NewSkills(characteristics);
    skills.climb = { value: 0, experienceCheck: true, notes: 'Afraid of heights' };
    skills.knowledge = [{ specialty: 'Blasphemous Lore', value: 0, experienceCheck: false }];
    skills.own = [{ name: 'Charm', value: 40, experienceCheck: false }];
    expect(HorrorD100SheetSchema.safeParse({ ...newSheet(), skills }).success).toBe(true);
    skills.climb = { value: -1, experienceCheck: false };
    expect(HorrorD100SheetSchema.safeParse({ ...newSheet(), skills }).success).toBe(false);
  });

  it('takes the whole skills block or none', () => {
    const { brawl: _brawl, ...missingOne } = horrorD100NewSkills(characteristics);
    expect(HorrorD100SheetSchema.safeParse({ ...newSheet(), skills: missingOne }).success).toBe(false);
  });

  it('takes the rest of a played character: derived attributes, weapons, armour, notes and the rest', () => {
    const played = {
      ...newSheet(),
      themeColor: '#336699',
      playerName: 'Sam',
      age: 34,
      sex: 'Female',
      residence: 'A port town',
      birthplace: 'Inland',
      hitPoints: { maximum: 12, current: -1 },
      powerPoints: { maximum: 12, current: 0 },
      sanity: { starting: 60, maximum: 97, current: 51 },
      move: 10,
      skills: horrorD100NewSkills(characteristics),
      weapons: [{ name: 'Fist', skill: 'Brawl', skillValue: 50, damage: '1D3+dm', range: 'Short', attacks: 1, ammo: null, malfunction: null, notes: '' }],
      armor: [{ name: 'Heavy coat', armorValue: 1, notes: 'Stops a little' }],
      conditions: { unconscious: false, dying: false, majorWound: true, temporaryInsanity: false },
      distinctiveFeatures: ['A crooked smile'],
      spells: ['Ward of the Threshold'],
      possessions: [{ name: 'Lantern', notes: 'Half full' }],
      wealth: { level: 'Average', cash: 40, assets: 'A flat', notes: '' },
      story: [{ title: 'Background & History', text: 'Grew up by the sea.' }, { title: '', text: '' }],
      contacts: [{ name: 'Rook', role: 'Fence', notes: 'Owes a favour' }],
      appearance: { age: 34, height: 'Tall', weight: '', eyes: 'Grey', hair: 'Black', skin: 'Pale' },
      notes: 'Only the GM reads this.',
      converted: conversion,
    };
    const result = HorrorD100SheetSchema.safeParse(played);
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it('keeps the conversion record when a converted sheet is saved', () => {
    const parsed = HorrorD100SheetSchema.parse({ ...newSheet(), converted: conversion });
    expect(parsed.converted).toEqual(conversion);
  });

  it('refuses a conversion record from any other shape', () => {
    expect(HorrorD100SheetSchema.safeParse({ ...newSheet(), converted: { ...conversion, from: 2 } }).success).toBe(false);
  });

  it('takes a conversion record of any size, so it never stops a save', () => {
    // The server writes the record from the old sheet, whose text may be
    // longer and whose lists fuller than anything a sheet takes today.
    const record = {
      ...conversion,
      damageModifier: 'd'.repeat(SHEET_LONG_TEXT_MAX),
      skills: Array.from({ length: 6 * SHEET_LIST_MAX }, (_, i) => ({ name: `${'s'.repeat(5000)} ${i}`, value: i })),
      kept: Array.from({ length: SHEET_LIST_MAX + 1 }, () => `stray: "${'x'.repeat(SHEET_LONG_TEXT_MAX + 1)}"`),
    };
    expect(HorrorD100SheetSchema.safeParse({ ...newSheet(), converted: record }).error?.issues ?? []).toEqual([]);
  });

  it('does not take the sheet as it was before 1.7.0', () => {
    // The old sheet's keys are written only in backend/src/legacy/.
    const old: unknown = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../../legacy/__fixtures__/horror-d100-sheets/v1.6.0-example-minimal.json'), 'utf8')
    );
    expect(HorrorD100SheetSchema.safeParse(old).success).toBe(false);
  });

  it('refuses a story note over the long-text limit and a list over its limit', () => {
    const long = { ...newSheet(), story: [{ title: 'Background & History', text: 'x'.repeat(SHEET_LONG_TEXT_MAX + 1) }] };
    expect(HorrorD100SheetSchema.safeParse(long).success).toBe(false);
    const many = { ...newSheet(), spells: Array.from({ length: SHEET_LIST_MAX + 1 }, () => 'A spell') };
    expect(HorrorD100SheetSchema.safeParse(many).success).toBe(false);
  });
});
