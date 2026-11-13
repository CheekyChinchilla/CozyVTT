// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * The Horror d100 sheet as its editor holds it, and what follows when a
 * characteristic or a skill changes there.
 *
 * Opening a sheet changes nothing it stores, and invents nothing. The editor
 * holds the sheet as stored. For each block the sheet lacks (hit points,
 * power points, Sanity, MOV and the skills at their base chances) it shows,
 * and saves, what the rules give for the sheet's characteristics, once the
 * characteristics that block needs are there; a characteristic the sheet
 * lacks stays empty until it is typed, and is never taken for 0. A value the
 * player can type is theirs, and stays as stored however it compares with
 * the rules' number.
 *
 * What the rules work out follows its source as that is edited: maximum hit
 * points follow CON and SIZ and maximum power points follow POW, each keeping
 * the damage taken or the points spent; Dodge, Gaming and the character's own
 * language move by as much as their base chance moves, so the points put into
 * them stay; and maximum Sanity follows Knowledge (Blasphemous Lore), taking
 * current Sanity down with it.
 */

import type { HorrorD100Sheet, HorrorD100SheetCharacteristics, HorrorD100SheetSkills } from '@/types/game-systems/horrorD100Sheet';
import { HORROR_D100_VALUE_MAX } from '@/constants/sheetLimits';
import { isHorrorD100BlasphemousLore } from '@/constants/horrorD100SkillNames';
import {
  HORROR_D100_HUMAN_MOVE,
  HORROR_D100_SANITY_CEILING,
  horrorD100CharacteristicRoll,
  horrorD100FixedSkillBase,
  horrorD100LanguageOwnBase,
  horrorD100MaximumHitPoints,
  horrorD100MaximumPowerPoints,
  horrorD100MaximumSanity,
  horrorD100NewSkills,
} from '@/utils/rules/horrorD100';

/** A characteristic the sheet holds a number for. */
export type HorrorD100CharacteristicKey = keyof HorrorD100SheetCharacteristics;

/**
 * The characteristics in the order the rules list them (open d100 rules,
 * p. 10, Point-Based Character Creation), the optional EDU last.
 */
export const HORROR_D100_CHARACTERISTIC_ORDER: readonly HorrorD100CharacteristicKey[] = ['STR', 'CON', 'SIZ', 'INT', 'POW', 'DEX', 'CHA', 'EDU'];

/**
 * The EDU a sheet starts with when a group takes up the option: the number
 * the rules start every characteristic at when points are spent on them
 * (open d100 rules, p. 10, Point-Based Character Creation).
 */
export const HORROR_D100_NEW_EDU = 10;

const number = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/**
 * The character's Knowledge (Blasphemous Lore): the highest rating among the
 * Knowledge specialties of that name, or 0 with none.
 */
export function horrorD100BlasphemousLore(skills: Pick<HorrorD100SheetSkills, 'knowledge'> | undefined): number {
  const held = Array.isArray(skills?.knowledge) ? skills.knowledge : [];
  return held.reduce((highest, entry) => (isHorrorD100BlasphemousLore(entry?.specialty) ? Math.max(highest, number(entry.value)) : highest), 0);
}

/**
 * The Sanity a character starts with: five times POW, at most 99 (open d100
 * rules, p. 16, Sanity Points).
 */
export function horrorD100StartingSanity(pow: number | undefined): number {
  return Math.max(0, Math.min(HORROR_D100_SANITY_CEILING, horrorD100CharacteristicRoll(number(pow))));
}

/**
 * The sheet as the editor holds it: the stored sheet, whose characteristics
 * may be missing, some or all. The conversion of the sheets stored before
 * 1.7.0 writes an old sheet that held none as a rebuilt one that holds none.
 */
export type HorrorD100FormSheet = Omit<HorrorD100Sheet, 'characteristics'> & {
  characteristics: Partial<HorrorD100SheetCharacteristics>;
};

/** The seven characteristics every sheet has; EDU is optional. */
const REQUIRED_CHARACTERISTICS = ['STR', 'CON', 'SIZ', 'INT', 'POW', 'DEX', 'CHA'] as const;

const present = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** A stored sheet as the editor holds it: as stored, with no characteristic it lacks. */
export function horrorD100FormSheet(data: HorrorD100Sheet): HorrorD100FormSheet {
  const stored: unknown = data.characteristics;
  return { ...data, characteristics: typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? data.characteristics : {} };
}

/** The characteristics a sheet must have and has no number for, in the sheet's order. */
export function horrorD100MissingCharacteristics(sheet: HorrorD100FormSheet): HorrorD100CharacteristicKey[] {
  return REQUIRED_CHARACTERISTICS.filter((key) => !present(sheet.characteristics[key]));
}

/**
 * The sheet with each block it lacks worked out from its characteristics,
 * as the editor shows it and saves it: hit points once it has CON and SIZ;
 * power points and Sanity once it has POW, Sanity starting at five times POW
 * as a new character's does; the skills at their base chances once it has
 * DEX, INT and POW, which Dodge, Gaming and the own language start from; and
 * MOV 10. A block whose characteristics are missing is left out: nothing is
 * worked out from a characteristic the sheet does not have. A skills block
 * missing some of its skills has those added, since the server takes the
 * whole block or none. Every stored value is kept.
 */
export function withHorrorD100MissingBlocks<T extends HorrorD100FormSheet>(sheet: T): T {
  const { CON, SIZ, POW, DEX, INT } = sheet.characteristics;
  const next = { ...sheet };
  if (!sheet.hitPoints && present(CON) && present(SIZ)) {
    const maximum = horrorD100MaximumHitPoints(CON, SIZ);
    next.hitPoints = { maximum, current: maximum };
  }
  if (!sheet.powerPoints && present(POW)) {
    const maximum = horrorD100MaximumPowerPoints(POW);
    next.powerPoints = { maximum, current: maximum };
  }
  if (present(DEX) && present(INT) && present(POW)) {
    const atBase = horrorD100NewSkills(sheet.characteristics);
    const stored: Partial<HorrorD100SheetSkills> = sheet.skills ?? {};
    if (Object.keys(atBase).some((key) => !(key in stored))) next.skills = { ...atBase, ...stored };
  }
  if (!sheet.sanity && present(POW)) {
    const maximum = horrorD100MaximumSanity(horrorD100BlasphemousLore(next.skills));
    const starting = horrorD100StartingSanity(POW);
    next.sanity = { starting, maximum, current: Math.min(starting, maximum) };
  }
  if (sheet.move === undefined) next.move = HORROR_D100_HUMAN_MOVE;
  return next;
}

/**
 * A stored sheet as the editor shows it when it opens: every value as stored,
 * and each block the sheet lacks that its characteristics give.
 */
export function openedHorrorD100Sheet(data: HorrorD100Sheet): HorrorD100FormSheet {
  return withHorrorD100MissingBlocks(horrorD100FormSheet(data));
}

/** A skill's rating moved by as much as its base chance moved. */
function moved<T extends { value: number }>(skill: T | undefined, by: number): T | undefined {
  return skill && by !== 0 ? { ...skill, value: number(skill.value) + by } : skill;
}

/** The sheet with new characteristics, and everything the rules work out from them following. */
function withCharacteristics(sheet: HorrorD100FormSheet, after: Partial<HorrorD100SheetCharacteristics>): HorrorD100FormSheet {
  const before = sheet.characteristics;
  const next: HorrorD100FormSheet = { ...sheet, characteristics: after };

  if (sheet.hitPoints && (after.CON !== before.CON || after.SIZ !== before.SIZ) && present(after.CON) && present(after.SIZ)) {
    const maximum = horrorD100MaximumHitPoints(after.CON, after.SIZ);
    next.hitPoints = { maximum, current: sheet.hitPoints.current + (maximum - sheet.hitPoints.maximum) };
  }
  if (sheet.powerPoints && after.POW !== before.POW && present(after.POW)) {
    const maximum = horrorD100MaximumPowerPoints(after.POW);
    next.powerPoints = { maximum, current: sheet.powerPoints.current + (maximum - sheet.powerPoints.maximum) };
  }
  if (sheet.skills) {
    // A stored rating moves with its base chance only where the sheet had
    // the characteristics that base comes from: one typed for the first time
    // moves nothing, since the rating was never counted from 0.
    const had = (...keys: HorrorD100CharacteristicKey[]) => keys.every((key) => present(before[key]) && present(after[key]));
    const baseMoved = (key: 'dodge' | 'gaming') => horrorD100FixedSkillBase(key, after) - horrorD100FixedSkillBase(key, before);
    const dodgeMoved = had('DEX') ? baseMoved('dodge') : 0;
    const gamingMoved = had('INT', 'POW') ? baseMoved('gaming') : 0;
    const languageMoved = had('INT') ? horrorD100LanguageOwnBase(number(after.INT), after.EDU) - horrorD100LanguageOwnBase(number(before.INT), before.EDU) : 0;
    if (dodgeMoved !== 0 || gamingMoved !== 0 || languageMoved !== 0) {
      next.skills = {
        ...sheet.skills,
        dodge: moved(sheet.skills.dodge, dodgeMoved) ?? sheet.skills.dodge,
        gaming: moved(sheet.skills.gaming, gamingMoved) ?? sheet.skills.gaming,
        languageOwn: moved(sheet.skills.languageOwn, languageMoved) ?? sheet.skills.languageOwn,
      };
    }
  }
  return next;
}

/**
 * The sheet with one characteristic changed in the editor. Nothing is held
 * within its limits here: a box passes through other numbers on the way to
 * the one being typed ("1" on the way to "14"), and a limit applied to those
 * would lose the damage taken or the points spent. horrorD100SheetToSave
 * applies the limits once, when the sheet is saved.
 */
export function withHorrorD100Characteristic(sheet: HorrorD100FormSheet, key: HorrorD100CharacteristicKey, value: number): HorrorD100FormSheet {
  return withCharacteristics(sheet, { ...sheet.characteristics, [key]: value });
}

/**
 * The sheet with the optional EDU taken up or dropped. It is taken up at
 * `edu`: the value it was dropped at earlier in the same edit, which the
 * editor remembers, or 10 for a sheet that had none.
 */
export function withHorrorD100Edu(sheet: HorrorD100FormSheet, used: boolean, edu: number = HORROR_D100_NEW_EDU): HorrorD100FormSheet {
  if (used === (sheet.characteristics.EDU !== undefined)) return sheet;
  if (used) return withCharacteristics(sheet, { ...sheet.characteristics, EDU: edu });
  const { EDU: _dropped, ...rest } = sheet.characteristics;
  return withCharacteristics(sheet, rest);
}

/**
 * The sheet with its skills changed in the editor. A change to Knowledge
 * (Blasphemous Lore) moves maximum Sanity, and current Sanity comes down to a
 * lower maximum (open d100 rules, p. 260, Maximum Sanity).
 */
export function withHorrorD100Skills<T extends HorrorD100FormSheet>(sheet: T, skills: HorrorD100SheetSkills): T {
  const lore = horrorD100BlasphemousLore(skills);
  if (!sheet.sanity || lore === horrorD100BlasphemousLore(sheet.skills)) return { ...sheet, skills };
  const maximum = horrorD100MaximumSanity(lore);
  return { ...sheet, skills, sanity: { ...sheet.sanity, maximum, current: Math.min(sheet.sanity.current, maximum) } };
}

const withinRating = (value: number): number => Math.max(0, Math.min(HORROR_D100_VALUE_MAX, value));

/**
 * The sheet as it is saved, or null while a characteristic it must have is
 * missing: each block it lacks worked out, and the numbers that followed a
 * characteristic held within what a sheet stores. Power points are never
 * below 0 (open d100 rules, p. 15, Power Points), and a rating runs from 0 to
 * the sheet's highest. Every other value is the one the editor holds.
 */
export function horrorD100SheetToSave(form: HorrorD100FormSheet): HorrorD100Sheet | null {
  const { STR, CON, SIZ, INT, POW, DEX, CHA, EDU } = form.characteristics;
  if (!present(STR) || !present(CON) || !present(SIZ) || !present(INT) || !present(POW) || !present(DEX) || !present(CHA)) return null;
  const sheet: HorrorD100Sheet = {
    ...withHorrorD100MissingBlocks(form),
    characteristics: { ...form.characteristics, STR, CON, SIZ, INT, POW, DEX, CHA, ...(EDU === undefined ? {} : { EDU }) },
  };
  let next = sheet;
  if (sheet.powerPoints && sheet.powerPoints.current < 0) {
    next = { ...next, powerPoints: { ...sheet.powerPoints, current: 0 } };
  }
  const skills = sheet.skills;
  if (skills) {
    const outside = (['dodge', 'gaming', 'languageOwn'] as const).filter((key) => skills[key] && skills[key].value !== withinRating(skills[key].value));
    if (outside.length > 0) {
      next = {
        ...next,
        skills: {
          ...skills,
          ...Object.fromEntries(outside.map((key) => [key, { ...skills[key], value: withinRating(skills[key].value) }])),
        },
      };
    }
  }
  return next;
}
