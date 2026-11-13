/**
 * A Horror d100 character for the sheet's tests: the blank built-in
 * template, which the server accepts as it stands, with the parts under test
 * overridden.
 */

import type { Character } from '../../../../types';
import type { HorrorD100Sheet, HorrorD100SheetSkills } from '@/types/game-systems/horrorD100Sheet';
import { horrorD100NewSkills } from '@/utils/rules/horrorD100';

const BLANK_CHARACTERISTICS = { STR: 10, CON: 10, SIZ: 10, INT: 10, POW: 10, DEX: 10, CHA: 10, EDU: 10 };

/** The blank sheet's skills: each at its base chance, and Knowledge (Blasphemous Lore) at 0. */
export function blankSkills(overrides: Partial<HorrorD100SheetSkills> = {}): HorrorD100SheetSkills {
  return {
    ...horrorD100NewSkills(BLANK_CHARACTERISTICS),
    knowledge: [{ specialty: 'Blasphemous Lore', value: 0, experienceCheck: false }],
    ...overrides,
  };
}

/** The blank sheet, as the server's blank template gives it. */
export function blankSheet(overrides: Partial<HorrorD100Sheet> = {}): HorrorD100Sheet {
  return {
    characterName: 'New Character',
    profession: 'Student',
    era: 'Modern',
    characteristics: { ...BLANK_CHARACTERISTICS },
    hitPoints: { maximum: 10, current: 10 },
    powerPoints: { maximum: 10, current: 10 },
    sanity: { starting: 50, maximum: 99, current: 50 },
    move: 10,
    skills: blankSkills(),
    weapons: [],
    armor: [],
    possessions: [],
    wealth: { level: 'Average', cash: 0, assets: '', notes: '' },
    story: [],
    ...overrides,
  };
}

/** A character holding the blank sheet with `overrides` over it. */
export function horrorD100Character(overrides: Partial<HorrorD100Sheet> = {}, character: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    userId: 'user-1',
    name: 'Character',
    gameSystem: 'HORROR_D100',
    campaignId: null,
    tokenImageUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    data: JSON.parse(JSON.stringify(blankSheet(overrides))),
    ...character,
  } as unknown as Character;
}
