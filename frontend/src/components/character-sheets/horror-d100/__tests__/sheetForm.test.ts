/**
 * What the Horror d100 editor does to a sheet as it opens and as a
 * characteristic or a skill changes in it.
 *
 * Opening changes nothing a sheet stores, and adds only the blocks it lacks.
 * A characteristic typed in the editor moves what the open d100 rules work
 * out from it, keeping the damage taken, the points spent and the points put
 * into a skill, whatever numbers the box passes through on the way.
 */

import { describe, it, expect } from 'vitest';
import {
  horrorD100BlasphemousLore,
  horrorD100SheetToSave,
  openedHorrorD100Sheet,
  withHorrorD100Characteristic,
  withHorrorD100Edu,
  withHorrorD100Skills,
} from '../sheetForm';
import { blankSheet, blankSkills } from './sheetFixture';
import type { HorrorD100Sheet } from '@/types/game-systems/horrorD100Sheet';

const minimal: HorrorD100Sheet = {
  characterName: 'Ines Okafor',
  profession: 'Sailor',
  era: '1920s',
  characteristics: { STR: 12, CON: 13, SIZ: 12, INT: 14, POW: 11, DEX: 15, CHA: 9 },
};

describe('opening a sheet', () => {
  it('keeps every stored value, a maximum the rules would not give included', () => {
    const stored = blankSheet({
      hitPoints: { maximum: 20, current: -3 },
      powerPoints: { maximum: 4, current: 1 },
      sanity: { starting: 12, maximum: 40, current: 30 },
      move: 7,
      skills: blankSkills({ dodge: { value: 3, experienceCheck: true, notes: 'slow' } }),
    });
    const opened = openedHorrorD100Sheet(stored);
    expect(opened).toEqual(stored);
  });

  it('works out the blocks a sheet lacks from its characteristics', () => {
    const opened = openedHorrorD100Sheet(minimal);
    expect(opened.hitPoints).toEqual({ maximum: 13, current: 13 });
    expect(opened.powerPoints).toEqual({ maximum: 11, current: 11 });
    expect(opened.sanity).toEqual({ starting: 55, maximum: 99, current: 55 });
    expect(opened.move).toBe(10);
    expect(opened.skills?.dodge).toEqual({ value: 30, experienceCheck: false });
    expect(opened.skills?.gaming.value).toBe(25);
    expect(opened.skills?.languageOwn).toEqual({ language: '', value: 70, experienceCheck: false });
    expect(opened.skills?.knowledge).toEqual([]);
    expect(opened).not.toHaveProperty('weapons');
    expect(opened).not.toHaveProperty('converted');
  });

  it('starts Sanity at 99 at most, and under a maximum Blasphemous Lore has lowered', () => {
    expect(openedHorrorD100Sheet({ ...minimal, characteristics: { ...minimal.characteristics, POW: 21 } }).sanity?.starting).toBe(99);
    const lore = blankSkills({ knowledge: [{ specialty: 'Blasphemous Lore', value: 60, experienceCheck: false }] });
    expect(openedHorrorD100Sheet({ ...minimal, skills: lore }).sanity).toEqual({ starting: 55, maximum: 40, current: 40 });
  });

  it('adds a skill the stored block lacks at its base chance, and keeps the rest', () => {
    const { climb: _missing, ...rest } = blankSkills({ spot: { value: 80, experienceCheck: true } });
    const opened = openedHorrorD100Sheet(blankSheet({ skills: rest as HorrorD100Sheet['skills'] }));
    expect(opened.skills?.climb).toEqual({ value: 40, experienceCheck: false });
    expect(opened.skills?.spot).toEqual({ value: 80, experienceCheck: true });
  });
});

describe('a characteristic changed in the editor', () => {
  const hurt = blankSheet({ hitPoints: { maximum: 10, current: 4 }, powerPoints: { maximum: 10, current: 2 } });

  it('moves maximum hit points with CON and SIZ, keeping the damage taken', () => {
    const next = withHorrorD100Characteristic(hurt, 'CON', 15);
    expect(next.hitPoints).toEqual({ maximum: 13, current: 7 });
    expect(withHorrorD100Characteristic(next, 'SIZ', 6).hitPoints).toEqual({ maximum: 11, current: 5 });
  });

  it('moves maximum power points with POW, keeping the points spent', () => {
    expect(withHorrorD100Characteristic(hurt, 'POW', 14).powerPoints).toEqual({ maximum: 14, current: 6 });
  });

  it('keeps the damage taken and the points spent whatever the box passes through', () => {
    // "13" typed over "10" commits 1, then 13.
    const typed = withHorrorD100Characteristic(withHorrorD100Characteristic(hurt, 'POW', 1), 'POW', 13);
    expect(typed.powerPoints).toEqual({ maximum: 13, current: 5 });
    const con = withHorrorD100Characteristic(withHorrorD100Characteristic(hurt, 'CON', 1), 'CON', 16);
    expect(con.hitPoints).toEqual({ maximum: 13, current: 7 });
  });

  it('moves Dodge, Gaming and the own language by as much as their base chance moves', () => {
    const raised = blankSheet({ skills: blankSkills({ dodge: { value: 45, experienceCheck: true }, gaming: { value: 5, experienceCheck: false } }) });
    const next = withHorrorD100Characteristic(withHorrorD100Characteristic(raised, 'DEX', 1), 'DEX', 12);
    expect(next.skills?.dodge).toEqual({ value: 49, experienceCheck: true });
    expect(withHorrorD100Characteristic(raised, 'POW', 13).skills?.gaming.value).toBe(8);
    expect(withHorrorD100Characteristic(raised, 'INT', 12).skills?.gaming.value).toBe(7);
    expect(withHorrorD100Characteristic(raised, 'INT', 12).skills?.languageOwn.value).toBe(60);
    // EDU 10 no longer sets the base once INT is higher; EDU 14 does.
    expect(withHorrorD100Characteristic(raised, 'EDU', 14).skills?.languageOwn.value).toBe(70);
  });

  it('changes nothing else, Sanity included', () => {
    const next = withHorrorD100Characteristic(hurt, 'POW', 14);
    expect(next.sanity).toBe(hurt.sanity);
    expect(next.skills?.spot).toBe(hurt.skills?.spot);
    expect(withHorrorD100Characteristic(hurt, 'STR', 14).skills).toBe(hurt.skills);
    expect(withHorrorD100Characteristic(hurt, 'CHA', 14).hitPoints).toBe(hurt.hitPoints);
  });
});

describe('the optional EDU', () => {
  it('is dropped, and the own language falls back to five times INT', () => {
    const sheet = blankSheet({ characteristics: { ...blankSheet().characteristics, EDU: 14 }, skills: blankSkills({ languageOwn: { language: 'Portuguese', value: 75, experienceCheck: false } }) });
    const without = withHorrorD100Edu(sheet, false);
    expect(without.characteristics).not.toHaveProperty('EDU');
    expect(without.skills?.languageOwn.value).toBe(55);
  });

  it('is taken up at 10', () => {
    const { EDU: _none, ...seven } = blankSheet().characteristics;
    const sheet = blankSheet({ characteristics: seven });
    expect(withHorrorD100Edu(sheet, true).characteristics.EDU).toBe(10);
    expect(withHorrorD100Edu(sheet, false)).toBe(sheet);
  });
});

describe('Knowledge (Blasphemous Lore)', () => {
  const lore = (value: number, specialty = 'Blasphemous Lore') => blankSkills({ knowledge: [{ specialty: 'Occult', value: 80, experienceCheck: false }, { specialty, value, experienceCheck: false }] });

  it('is read however its name was typed, the highest of several', () => {
    expect(horrorD100BlasphemousLore(lore(12, '  blasphemous lore '))).toBe(12);
    expect(horrorD100BlasphemousLore(blankSkills({ knowledge: [] }))).toBe(0);
    expect(horrorD100BlasphemousLore(undefined)).toBe(0);
    const two = blankSkills({ knowledge: [{ specialty: 'Blasphemous Lore', value: 4, experienceCheck: false }, { specialty: 'Blasphemous Lore', value: 9, experienceCheck: false }] });
    expect(horrorD100BlasphemousLore(two)).toBe(9);
  });

  it('lowers maximum Sanity as it rises, and current Sanity with it', () => {
    const sheet = blankSheet({ sanity: { starting: 50, maximum: 99, current: 70 } });
    expect(withHorrorD100Skills(sheet, lore(43)).sanity).toEqual({ starting: 50, maximum: 57, current: 57 });
    expect(withHorrorD100Skills(sheet, lore(20)).sanity).toEqual({ starting: 50, maximum: 80, current: 70 });
    expect(withHorrorD100Skills(sheet, lore(250)).sanity).toEqual({ starting: 50, maximum: 0, current: 0 });
  });

  it('leaves Sanity as stored while it does not change', () => {
    const sheet = blankSheet({ sanity: { starting: 50, maximum: 30, current: 30 } });
    const skills = blankSkills({ spot: { value: 60, experienceCheck: false } });
    const next = withHorrorD100Skills(sheet, skills);
    expect(next.sanity).toBe(sheet.sanity);
    expect(next.skills).toBe(skills);
  });
});

describe('the sheet as it is saved', () => {
  it('is the sheet the editor holds when nothing is outside its limits', () => {
    const sheet = blankSheet();
    expect(horrorD100SheetToSave(sheet)).toEqual(sheet);
  });

  it('is none while a characteristic the sheet must have is missing, 0 never standing in for it', () => {
    const { POW: _none, ...six } = blankSheet().characteristics;
    expect(horrorD100SheetToSave({ ...blankSheet(), characteristics: six })).toBeNull();
    expect(horrorD100SheetToSave({ ...blankSheet(), characteristics: {} })).toBeNull();
    expect(horrorD100SheetToSave({ ...blankSheet(), characteristics: { ...six, POW: 0 } })?.characteristics.POW).toBe(0);
  });

  it('holds power points at 0 and the ratings that followed a characteristic within a sheet\'s range', () => {
    const sheet = blankSheet({
      hitPoints: { maximum: 3, current: -6 },
      powerPoints: { maximum: 1, current: -9 },
      skills: blankSkills({ dodge: { value: -18, experienceCheck: false }, gaming: { value: 1200, experienceCheck: false } }),
    });
    const saved = horrorD100SheetToSave(sheet);
    if (!saved) throw new Error('the sheet has every characteristic');
    expect(saved.powerPoints).toEqual({ maximum: 1, current: 0 });
    expect(saved.hitPoints).toEqual({ maximum: 3, current: -6 });
    expect(saved.skills?.dodge.value).toBe(0);
    expect(saved.skills?.gaming.value).toBe(999);
    expect(saved.skills?.languageOwn).toBe(sheet.skills?.languageOwn);
  });
});
