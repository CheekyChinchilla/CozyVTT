/**
 * The character roll picker.
 *
 * These cover four places where the extractor read a field name that has never
 * matched what is stored. Each one failed silently — a skill offered at +0, or
 * a whole category of rolls simply absent — because `data: any` meant nothing
 * checked the reads against the shape the schema defines.
 *
 * The data below is shaped the way the backend validators require, so a test
 * passing here means the picker agrees with what a real sheet holds.
 */

import { describe, it, expect } from 'vitest';

import { getCharacterRolls } from '../characterRolls';
import type { CharacterData } from '@/types';

const labels = (options: { label: string }[]) => options.map((o) => o.label);

// ---------------------------------------------------------------------------
// Pathfinder 2e
// ---------------------------------------------------------------------------

const pf2eBase = {
  characterName: 'Seelah',
  class: 'Champion',
  level: 5,
  ancestry: 'Human',
  heritage: 'Versatile',
  attributes: {
    strength:     { score: 18, modifier: 4 },
    dexterity:    { score: 12, modifier: 1 },
    constitution: { score: 14, modifier: 2 },
    intelligence: { score: 10, modifier: 0 },
    wisdom:       { score: 12, modifier: 1 },
    charisma:     { score: 16, modifier: 3 },
  },
};

describe('Pathfinder 2e', () => {
  // A skill stores its total modifier as `bonus`. The extractor used to read
  // `total`, which is not a field, so every skill came out at +0.
  it('offers a skill at the bonus the sheet stores, not +0', () => {
    const data = {
      ...pf2eBase,
      skills: {
        athletics: {
          attribute: 'strength',
          proficiencyRank: 'expert',
          armorPenalty: 0,
          itemBonus: 0,
          bonus: 11,
        },
      },
    } as unknown as CharacterData;

    const { skills } = getCharacterRolls('PATHFINDER_2E', data);
    const athletics = skills.find((s) => s.label.startsWith('Athletics'));

    expect(athletics).toBeDefined();
    expect(athletics!.expression).toBe('1d20+11');
    expect(athletics!.label).toBe('Athletics +11');
  });

  // Lore skills are stored at the top level of the sheet, which is where the
  // editor writes them. The extractor used to look inside `skills`.
  it('offers lore skills, which are stored at the top level', () => {
    const data = {
      ...pf2eBase,
      loreSkills: [
        {
          name: 'Sailing',
          attribute: 'intelligence',
          proficiencyRank: 'trained',
          itemBonus: 0,
          bonus: 7,
        },
      ],
    } as unknown as CharacterData;

    const { skills } = getCharacterRolls('PATHFINDER_2E', data);
    const sailing = skills.find((s) => s.label.includes('Sailing'));

    expect(sailing).toBeDefined();
    expect(sailing!.expression).toBe('1d20+7');
  });

  it('offers nothing for a sheet with neither', () => {
    const { skills } = getCharacterRolls('PATHFINDER_2E', pf2eBase as unknown as CharacterData);
    expect(skills).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Call of Cthulhu 7e
// ---------------------------------------------------------------------------

const characteristic = (regular: number) => ({
  regular,
  half: Math.floor(regular / 2),
  fifth: Math.floor(regular / 5),
});

const cocBase = {
  investigatorName: 'Harvey Walters',
  occupation: 'Journalist',
  era: 'Modern',
  characteristics: {
    STR: characteristic(50),
    CON: characteristic(60),
    SIZ: characteristic(55),
    DEX: characteristic(70),
    APP: characteristic(45),
    INT: characteristic(80),
    POW: characteristic(65),
    EDU: characteristic(75),
  },
};

describe('Call of Cthulhu 7e', () => {
  // Two mistakes in one lookup: characteristics are stored under `STR`, `CON`
  // and so on, and each holds `regular` rather than `value`. The extractor
  // looked up lowercase keys and read `.value`, so the `typeof` guard below it
  // rejected all eight and an investigator was offered no characteristic rolls
  // at all.
  it('offers a check for every characteristic', () => {
    const { abilities } = getCharacterRolls('CALL_OF_CTHULHU_7E', cocBase as unknown as CharacterData);

    expect(abilities).toHaveLength(8);
    expect(labels(abilities)).toContain('STR (target: 50%)');
    expect(labels(abilities)).toContain('EDU (target: 75%)');
    expect(abilities.every((a) => a.expression === '1d100')).toBe(true);
  });

  // Weapons are nested under `combat`, which is where the schema puts them and
  // where the editor writes them. The extractor used to read `data.weapons`.
  it('offers an attack and a damage roll for a weapon under combat', () => {
    const data = {
      ...cocBase,
      combat: {
        weapons: [
          { name: '.38 Revolver', skill: 'Firearms (Handgun)', skillValue: 45, damage: '1d10' },
        ],
      },
    } as unknown as CharacterData;

    const { combat } = getCharacterRolls('CALL_OF_CTHULHU_7E', data);

    const attack = combat.find((c) => c.purpose.includes('Attack'));
    expect(attack).toBeDefined();
    expect(attack!.expression).toBe('1d100');
    expect(attack!.label).toContain('45%');

    const damage = combat.find((c) => c.purpose.endsWith('Damage'));
    expect(damage).toBeDefined();
    expect(damage!.expression).toBe('1d10');
  });

  it('skips a weapon with no damage expression rather than offering a broken roll', () => {
    const data = {
      ...cocBase,
      combat: { weapons: [{ name: 'Fist', skill: 'Fighting (Brawl)', skillValue: 25 }] },
    } as unknown as CharacterData;

    const { combat } = getCharacterRolls('CALL_OF_CTHULHU_7E', data);
    expect(combat).toHaveLength(1);
    expect(combat[0].purpose).toContain('Attack');
  });
});

// ---------------------------------------------------------------------------
// D&D 5e — the control. This one was always right, and must stay that way.
// ---------------------------------------------------------------------------

describe('D&D 5e', () => {
  it('offers an ability check at the stored modifier', () => {
    const data = {
      characterName: 'Aeryn',
      class: 'Fighter',
      level: 3,
      race: 'Human',
      proficiencyBonus: 2,
      stats: {
        strength:     { score: 16, modifier: 3 },
        dexterity:    { score: 14, modifier: 2 },
        constitution: { score: 14, modifier: 2 },
        intelligence: { score: 10, modifier: 0 },
        wisdom:       { score: 12, modifier: 1 },
        charisma:     { score: 8,  modifier: -1 },
      },
    } as unknown as CharacterData;

    const { abilities } = getCharacterRolls('DND_5E', data);
    const str = abilities.find((a) => a.label.startsWith('STR'));

    expect(str).toBeDefined();
    expect(str!.expression).toBe('1d20+3');
    expect(str!.supportsAdvantage).toBe(true);
  });
});

describe('an unknown or absent system', () => {
  it('offers nothing rather than throwing', () => {
    expect(getCharacterRolls(null, null)).toEqual({
      abilities: [], skills: [], savingThrows: [], combat: [],
    });
    expect(getCharacterRolls('SHADOWRUN_6E', {} as CharacterData)).toEqual({
      abilities: [], skills: [], savingThrows: [], combat: [],
    });
  });
});
