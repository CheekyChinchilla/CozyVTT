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
  // The extractor used to read `total`, which is not a field, so every skill
  // came out at +0. It now works the total out from the skill's parts, as the
  // sheet shows it, so a stored total that is out of date is not rolled.
  it('offers a skill at the total its parts give, not +0', () => {
    const data = {
      ...pf2eBase,
      skills: {
        athletics: {
          attribute: 'strength',
          proficiencyRank: 'expert',
          armorPenalty: -1,
          itemBonus: 1,
          bonus: 0,
        },
      },
    } as unknown as CharacterData;

    const { skills } = getCharacterRolls('PATHFINDER_2E', data);
    const athletics = skills.find((s) => s.label.startsWith('Athletics'));

    // Strength +4, level 5 expert +9, item +1, check penalty -1.
    expect(athletics).toBeDefined();
    expect(athletics!.expression).toBe('1d20+13');
    expect(athletics!.label).toBe('Athletics +13');
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

describe('D&D 5e hit dice', () => {
  /**
   * `total` is the pool, so a spend is one die plus Constitution — never the
   * stored string, which would roll the whole pool at once.
   */
  const sheet = (hitDice: unknown, conModifier = 2) => ({
    stats: {
      strength:     { score: 10, modifier: 0 },
      dexterity:    { score: 10, modifier: 0 },
      constitution: { score: 14, modifier: conModifier },
      intelligence: { score: 10, modifier: 0 },
      wisdom:       { score: 10, modifier: 0 },
      charisma:     { score: 10, modifier: 0 },
    },
    hitDice,
  } as unknown as CharacterData);

  it('offers one die plus Constitution, not the whole pool', () => {
    const { hitDice } = getCharacterRolls('DND_5E', sheet([{ class: 'fighter', total: '5d10', remaining: 3 }]));
    expect(hitDice).toHaveLength(1);
    expect(hitDice[0].expression).toBe('1d10+2');
    expect(hitDice[0].expression).not.toContain('5d10');
    expect(hitDice[0].purpose).toMatch(/hit die/i);
  });

  it('carries the pool position so the spend can be recorded', () => {
    const { hitDice } = getCharacterRolls('DND_5E', sheet([
      { class: 'fighter', total: '5d10', remaining: 3 },
      { class: 'rogue',   total: '2d8',  remaining: 2 },
    ]));
    expect(hitDice.map((h) => h.hitDiceIndex)).toEqual([0, 1]);
    expect(hitDice[1].expression).toBe('1d8+2');
  });

  it('offers nothing once the pool is spent', () => {
    const { hitDice } = getCharacterRolls('DND_5E', sheet([{ class: 'fighter', total: '5d10', remaining: 0 }]));
    expect(hitDice).toHaveLength(0);
  });

  it('offers nothing for a total that is not a die', () => {
    const { hitDice } = getCharacterRolls('DND_5E', sheet([{ class: 'fighter', total: '', remaining: 3 }]));
    expect(hitDice).toHaveLength(0);
  });

  it('keeps a negative Constitution modifier in the roll', () => {
    const { hitDice } = getCharacterRolls('DND_5E', sheet([{ class: 'wizard', total: '3d6', remaining: 1 }], -1));
    expect(hitDice[0].expression).toBe('1d6-1');
  });

  it('rolls a compound hit die as written, not as a single die', () => {
    const { hitDice } = getCharacterRolls('DND_5E', sheet([{ class: 'brawler', die: '2d6', maximum: 4, remaining: 4 }]));
    expect(hitDice).toHaveLength(1);
    expect(hitDice[0].expression).toBe('2d6+2');
    expect(hitDice[0].label).toContain('2d6');
    expect(hitDice[0].label).toContain('4/4');
  });

  it('prefers the die field over an older pool string', () => {
    const { hitDice } = getCharacterRolls('DND_5E', sheet([
      { class: 'fighter', die: 'd12', maximum: 5, total: '5d10', remaining: 2 },
    ]));
    expect(hitDice[0].expression).toBe('d12+2');
    expect(hitDice[0].label).toContain('2/5');
  });

  it('is empty, not missing, for a system without hit dice', () => {
    expect(getCharacterRolls('PATHFINDER_2E', {} as CharacterData).hitDice).toEqual([]);
    expect(getCharacterRolls(null, null).hitDice).toEqual([]);
  });
});

describe('an unknown or absent system', () => {
  it('offers nothing rather than throwing', () => {
    expect(getCharacterRolls(null, null)).toEqual({
      abilities: [], skills: [], savingThrows: [], combat: [], hitDice: [],
    });
    expect(getCharacterRolls('SHADOWRUN_6E', {} as CharacterData)).toEqual({
      abilities: [], skills: [], savingThrows: [], combat: [], hitDice: [],
    });
  });
});

describe('D&D 5e skills and saves with an other bonus', () => {
  const ability = { score: 10, modifier: 0 };
  const base = {
    characterName: 'Lark',
    class: 'Bard',
    level: 1,
    race: 'Human',
    proficiencyBonus: 2,
    stats: {
      strength: ability, dexterity: { score: 14, modifier: 2 }, constitution: ability,
      intelligence: ability, wisdom: ability, charisma: ability,
    },
  };

  it('rolls the ability, proficiency and other bonus together', () => {
    const data = {
      ...base,
      skills: { stealth: { proficient: true, expertise: false, bonus: 0, otherBonus: 1 } },
      savingThrows: { dexterity: { proficient: true, bonus: 0, otherBonus: 2 } },
    } as unknown as CharacterData;

    const rolls = getCharacterRolls('DND_5E', data);

    expect(rolls.skills.find((s) => s.label.startsWith('Stealth'))?.expression).toBe('1d20+5');
    expect(rolls.savingThrows.find((s) => s.label.startsWith('Dexterity'))?.expression).toBe('1d20+6');
  });

  it('rolls a sheet saved before the other bonus existed at the total it stores', () => {
    const data = {
      ...base,
      skills: { stealth: { proficient: false, expertise: false, bonus: 3 } },
      savingThrows: { dexterity: { proficient: false, bonus: 5 } },
    } as unknown as CharacterData;

    const rolls = getCharacterRolls('DND_5E', data);

    expect(rolls.skills.find((s) => s.label.startsWith('Stealth'))?.expression).toBe('1d20+3');
    expect(rolls.savingThrows.find((s) => s.label.startsWith('Dexterity'))?.expression).toBe('1d20+5');
  });
});

// The built-in template names a lore "Warfare Lore" and the Core Rulebook
// writes them so ("Sailing Lore"), but the roll added " Lore" to every name,
// so it read "Warfare Lore Lore".
describe('Pathfinder 2e lore names', () => {
  const lore = (name: string) => ({
    ...pf2eBase,
    loreSkills: [{ name, attribute: 'intelligence', proficiencyRank: 'trained', itemBonus: 0, bonus: 0 }],
  }) as unknown as CharacterData;

  it('adds Lore to a name without it', () => {
    const [sailing] = getCharacterRolls('PATHFINDER_2E', lore('Sailing')).skills;
    expect(sailing.purpose).toBe('Sailing Lore Check');
    expect(sailing.label).toBe('Sailing Lore +7');
  });

  it('leaves a name that already ends in Lore as it is', () => {
    const [warfare] = getCharacterRolls('PATHFINDER_2E', lore('Warfare lore')).skills;
    expect(warfare.purpose).toBe('Warfare lore Check');
    expect(warfare.label).toBe('Warfare lore +7');
  });
});

// The Call of Cthulhu roll menu skipped the Fighting and Firearms
// specialisations a player adds, and any Firearms skill at 0.
describe('Call of Cthulhu specialisations in the roll menu', () => {
  const skill = (value: number, extra: Record<string, unknown> = {}) => ({ baseValue: value, currentValue: value, improvementChecked: false, ...extra });
  const data = {
    skills: {
      fighting: { brawl: skill(25), custom: [skill(40, { specialization: 'Sword' })] },
      firearms: { handgun: skill(20), rifle: skill(25), shotgun: skill(0), custom: [skill(30, { specialization: 'Bow' })] },
    },
  } as unknown as CharacterData;

  it('offers each one by its name', () => {
    const labels = getCharacterRolls('CALL_OF_CTHULHU_7E', data).skills.map((s) => s.label);
    expect(labels).toEqual(expect.arrayContaining([
      'Fighting (Sword) — target: 40%',
      'Firearms (Bow) — target: 30%',
      'Firearms (Shotgun) — target: 0%',
    ]));
  });
});

// A Call of Cthulhu weapon's damage written with DB was left out of the menu,
// which cannot roll text, and its skill was the value stored with the weapon.
describe('Call of Cthulhu weapons in the roll menu', () => {
  const data = {
    derivedStats: { damageBonus: '+1d4' },
    skills: { firearms: { handgun: { baseValue: 20, currentValue: 60, improvementChecked: false }, rifle: { currentValue: 25 }, shotgun: { currentValue: 25 }, custom: [] } },
    combat: {
      weapons: [
        { name: 'Fist', skill: 'Brawl', skillValue: 25, damage: '1d3+DB' },
        { name: '.38 Revolver', skill: 'Handgun', skillValue: 20, damage: '1d10' },
      ],
    },
  } as unknown as CharacterData;

  it('rolls the damage bonus in place of DB', () => {
    const fist = getCharacterRolls('CALL_OF_CTHULHU_7E', data).combat.find((c) => c.label.startsWith('Fist Damage'));
    expect(fist?.expression).toBe('1d3+1d4');
  });

  it('takes the skill value from the skill the weapon names', () => {
    const labels = getCharacterRolls('CALL_OF_CTHULHU_7E', data).combat.map((c) => c.label);
    expect(labels).toContain('.38 Revolver (Handgun, target: 60%)');
  });
});
