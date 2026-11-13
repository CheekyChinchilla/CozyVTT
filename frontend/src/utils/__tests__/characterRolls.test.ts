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
// Fantasy d20
// ---------------------------------------------------------------------------

const fantasyD20Base = {
  characterName: 'Maren',
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

describe('Fantasy d20', () => {
  // The extractor used to read `total`, which is not a field, so every skill
  // came out at +0. It now works the total out from the skill's parts, as the
  // sheet shows it, so a stored total that is out of date is not rolled.
  it('offers a skill at the total its parts give, not +0', () => {
    const data = {
      ...fantasyD20Base,
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

    const { skills } = getCharacterRolls('FANTASY_D20', data);
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
      ...fantasyD20Base,
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

    const { skills } = getCharacterRolls('FANTASY_D20', data);
    const sailing = skills.find((s) => s.label.includes('Sailing'));

    expect(sailing).toBeDefined();
    expect(sailing!.expression).toBe('1d20+7');
  });

  it('offers nothing for a sheet with neither', () => {
    const { skills } = getCharacterRolls('FANTASY_D20', fantasyD20Base as unknown as CharacterData);
    expect(skills).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Horror d100
// ---------------------------------------------------------------------------

const horrorD100Base = {
  characterName: 'Mara Quill',
  profession: 'Journalist',
  era: 'Modern',
  characteristics: { STR: 10, CON: 12, SIZ: 11, INT: 16, POW: 13, DEX: 14, CHA: 9, EDU: 15 },
};

describe('Horror d100', () => {
  // The open d100 rules roll a characteristic at five times its value, each
  // roll under a name of its own; SIZ gives none, and Luck is the POW roll.
  it('offers each characteristic\'s roll at five times the characteristic, Luck as POW×5', () => {
    const { abilities } = getCharacterRolls('HORROR_D100', horrorD100Base as unknown as CharacterData);

    expect(labels(abilities)).toEqual([
      'Effort (STR×5, target: 50%)',
      'Stamina (CON×5, target: 60%)',
      'Idea (INT×5, target: 80%)',
      'Luck (POW×5, target: 65%)',
      'Agility (DEX×5, target: 70%)',
      'Charm (CHA×5, target: 45%)',
      'Knowledge (EDU×5, target: 75%)',
    ]);
    expect(abilities.every((a) => a.expression === '1d100')).toBe(true);
    expect(abilities[3].purpose).toBe('Luck (POW×5) — target: 65%');
  });

  it('offers no Knowledge roll for a sheet without the optional EDU, and none for a characteristic that is no number', () => {
    const { EDU: _none, ...seven } = horrorD100Base.characteristics;
    const data = { ...horrorD100Base, characteristics: { ...seven, STR: 'strong' } } as unknown as CharacterData;
    expect(labels(getCharacterRolls('HORROR_D100', data).abilities).map((label) => label.split(' ')[0])).toEqual(['Stamina', 'Idea', 'Luck', 'Agility', 'Charm']);
  });

  it('offers an attack and a damage roll for a weapon', () => {
    const data = {
      ...horrorD100Base,
      weapons: [
        { name: '.38 Revolver', skill: 'Firearm (Handgun)', skillValue: 45, damage: '1d10' },
      ],
    } as unknown as CharacterData;

    const { combat } = getCharacterRolls('HORROR_D100', data);

    const attack = combat.find((c) => c.purpose.includes('Attack'));
    expect(attack).toBeDefined();
    expect(attack!.expression).toBe('1d100');
    expect(attack!.label).toContain('45%');

    const damage = combat.find((c) => c.purpose.endsWith('Damage'));
    expect(damage).toBeDefined();
    expect(damage!.expression).toBe('1d10');
  });

  // The roll menu names each skill as the sheet's skill list does, the open
  // d100 rules' names, and lists them in the sheet's order.
  it('names the skills as the sheet does, in its order', () => {
    const at = (value: number) => ({ value, experienceCheck: false });
    const data = {
      ...horrorD100Base,
      skills: {
        status: at(30), research: at(55), psychotherapy: at(11), spot: at(60), fineManipulation: at(8), insight: at(40),
        languageOwn: { language: 'English', ...at(75) },
        knowledge: [{ specialty: 'Blasphemous Lore', ...at(4) }, { specialty: 'Natural History', ...at(25) }],
        drive: [{ specialty: 'Automobile', ...at(20) }],
        heavyMachine: [{ specialty: '', ...at(1) }],
        repair: [{ specialty: 'Electrical', ...at(10) }, { specialty: 'Mechanical', ...at(15) }],
        languageOther: [{ specialty: 'Latin', ...at(30) }],
        own: [{ name: 'Charm', ...at(45) }, { name: '', ...at(5) }],
      },
    } as unknown as CharacterData;

    const rolls = getCharacterRolls('HORROR_D100', data).skills;
    expect(rolls.map((s) => s.purpose)).toEqual([
      'Language (Own) — target: 75%',
      'Language (Latin) — target: 30%',
      'Status — target: 30%',
      'Fine Manipulation — target: 8%',
      'Heavy Machine — target: 1%',
      'Repair (Electrical) — target: 10%',
      'Repair (Mechanical) — target: 15%',
      'Knowledge (Blasphemous Lore) — target: 4%',
      'Knowledge (Natural History) — target: 25%',
      'Psychotherapy — target: 11%',
      'Insight — target: 40%',
      'Research — target: 55%',
      'Spot — target: 60%',
      'Drive (Automobile) — target: 20%',
      'Charm — target: 45%',
    ]);
    expect(rolls.every((s) => s.label === s.purpose && s.expression === '1d100')).toBe(true);
  });

  it('skips a weapon with no damage expression rather than offering a broken roll', () => {
    const data = {
      ...horrorD100Base,
      weapons: [{ name: 'Fist', skill: 'Brawl', skillValue: 25 }],
    } as unknown as CharacterData;

    const { combat } = getCharacterRolls('HORROR_D100', data);
    expect(combat).toHaveLength(1);
    expect(combat[0].purpose).toContain('Attack');
  });
});

// ---------------------------------------------------------------------------
// 5E — the control. This one was always right, and must stay that way.
// ---------------------------------------------------------------------------

describe('5E', () => {
  it('offers an ability check at the stored modifier', () => {
    const data = {
      characterName: 'Sefa',
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

    const { abilities } = getCharacterRolls('FIFTH_EDITION', data);
    const str = abilities.find((a) => a.label.startsWith('STR'));

    expect(str).toBeDefined();
    expect(str!.expression).toBe('1d20+3');
    expect(str!.supportsAdvantage).toBe(true);
  });
});

describe('5E hit dice', () => {
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
    const { hitDice } = getCharacterRolls('FIFTH_EDITION', sheet([{ class: 'fighter', total: '5d10', remaining: 3 }]));
    expect(hitDice).toHaveLength(1);
    expect(hitDice[0].expression).toBe('1d10+2');
    expect(hitDice[0].expression).not.toContain('5d10');
    expect(hitDice[0].purpose).toMatch(/hit die/i);
  });

  it('carries the pool position so the spend can be recorded', () => {
    const { hitDice } = getCharacterRolls('FIFTH_EDITION', sheet([
      { class: 'fighter', total: '5d10', remaining: 3 },
      { class: 'rogue',   total: '2d8',  remaining: 2 },
    ]));
    expect(hitDice.map((h) => h.hitDiceIndex)).toEqual([0, 1]);
    expect(hitDice[1].expression).toBe('1d8+2');
  });

  it('offers nothing once the pool is spent', () => {
    const { hitDice } = getCharacterRolls('FIFTH_EDITION', sheet([{ class: 'fighter', total: '5d10', remaining: 0 }]));
    expect(hitDice).toHaveLength(0);
  });

  it('offers nothing for a total that is not a die', () => {
    const { hitDice } = getCharacterRolls('FIFTH_EDITION', sheet([{ class: 'fighter', total: '', remaining: 3 }]));
    expect(hitDice).toHaveLength(0);
  });

  it('keeps a negative Constitution modifier in the roll', () => {
    const { hitDice } = getCharacterRolls('FIFTH_EDITION', sheet([{ class: 'wizard', total: '3d6', remaining: 1 }], -1));
    expect(hitDice[0].expression).toBe('1d6-1');
  });

  it('rolls a compound hit die as written, not as a single die', () => {
    const { hitDice } = getCharacterRolls('FIFTH_EDITION', sheet([{ class: 'brawler', die: '2d6', maximum: 4, remaining: 4 }]));
    expect(hitDice).toHaveLength(1);
    expect(hitDice[0].expression).toBe('2d6+2');
    expect(hitDice[0].label).toContain('2d6');
    expect(hitDice[0].label).toContain('4/4');
  });

  it('prefers the die field over an older pool string', () => {
    const { hitDice } = getCharacterRolls('FIFTH_EDITION', sheet([
      { class: 'fighter', die: 'd12', maximum: 5, total: '5d10', remaining: 2 },
    ]));
    expect(hitDice[0].expression).toBe('d12+2');
    expect(hitDice[0].label).toContain('2/5');
  });

  it('is empty, not missing, for a system without hit dice', () => {
    expect(getCharacterRolls('FANTASY_D20', {} as CharacterData).hitDice).toEqual([]);
    expect(getCharacterRolls(null, null).hitDice).toEqual([]);
  });
});

describe('an unknown or absent system', () => {
  it('offers nothing rather than throwing', () => {
    expect(getCharacterRolls(null, null)).toEqual({
      abilities: [], skills: [], savingThrows: [], combat: [], hitDice: [],
    });
    expect(getCharacterRolls('SOMETHING_ELSE', {} as CharacterData)).toEqual({
      abilities: [], skills: [], savingThrows: [], combat: [], hitDice: [],
    });
  });
});

describe('5E skills and saves with an other bonus', () => {
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

    const rolls = getCharacterRolls('FIFTH_EDITION', data);

    expect(rolls.skills.find((s) => s.label.startsWith('Stealth'))?.expression).toBe('1d20+5');
    expect(rolls.savingThrows.find((s) => s.label.startsWith('Dexterity'))?.expression).toBe('1d20+6');
  });

  it('rolls a sheet saved before the other bonus existed at the total it stores', () => {
    const data = {
      ...base,
      skills: { stealth: { proficient: false, expertise: false, bonus: 3 } },
      savingThrows: { dexterity: { proficient: false, bonus: 5 } },
    } as unknown as CharacterData;

    const rolls = getCharacterRolls('FIFTH_EDITION', data);

    expect(rolls.skills.find((s) => s.label.startsWith('Stealth'))?.expression).toBe('1d20+3');
    expect(rolls.savingThrows.find((s) => s.label.startsWith('Dexterity'))?.expression).toBe('1d20+5');
  });
});

// The built-in template names a lore "Warfare Lore" and the rules write them
// so ("Sailing Lore"), but the roll added " Lore" to every name,
// so it read "Warfare Lore Lore".
describe('Fantasy d20 lore names', () => {
  const lore = (name: string) => ({
    ...fantasyD20Base,
    loreSkills: [{ name, attribute: 'intelligence', proficiencyRank: 'trained', itemBonus: 0, bonus: 0 }],
  }) as unknown as CharacterData;

  it('adds Lore to a name without it', () => {
    const [sailing] = getCharacterRolls('FANTASY_D20', lore('Sailing')).skills;
    expect(sailing.purpose).toBe('Sailing Lore Check');
    expect(sailing.label).toBe('Sailing Lore +7');
  });

  it('leaves a name that already ends in Lore as it is', () => {
    const [warfare] = getCharacterRolls('FANTASY_D20', lore('Warfare lore')).skills;
    expect(warfare.purpose).toBe('Warfare lore Check');
    expect(warfare.label).toBe('Warfare lore +7');
  });
});

// Each specialty a character holds is offered by its own name, one at 0 too.
describe('Horror d100 specialties in the roll menu', () => {
  const skill = (specialty: string, value: number) => ({ specialty, value, experienceCheck: false });
  const data = {
    skills: {
      brawl: { value: 25, experienceCheck: false },
      meleeWeapon: [skill('Sword', 40)],
      firearm: [skill('Handgun', 20), skill('Rifle', 25), skill('Shotgun', 0)],
      missileWeapon: [skill('Bow', 30)],
    },
  } as unknown as CharacterData;

  it('offers each one by its name', () => {
    const rolls = getCharacterRolls('HORROR_D100', data).skills;
    expect(rolls.map((s) => [s.label, s.purpose])).toEqual([
      ['Brawl — target: 25%', 'Brawl — target: 25%'],
      ['Firearm (Handgun) — target: 20%', 'Firearm (Handgun) — target: 20%'],
      ['Firearm (Rifle) — target: 25%', 'Firearm (Rifle) — target: 25%'],
      ['Firearm (Shotgun) — target: 0%', 'Firearm (Shotgun) — target: 0%'],
      ['Melee Weapon (Sword) — target: 40%', 'Melee Weapon (Sword) — target: 40%'],
      ['Missile Weapon (Bow) — target: 30%', 'Missile Weapon (Bow) — target: 30%'],
    ]);
  });
});

// A Horror d100 weapon's damage is rolled with the character's damage
// modifier where it says so, in the rules' notation or the one the sheet
// used before it was rebuilt, and its skill is the one the weapon names.
describe('Horror d100 weapons in the roll menu', () => {
  const data = {
    // STR 16 + SIZ 13: a damage modifier of +1D4.
    characteristics: { STR: 16, SIZ: 13 },
    skills: {
      brawl: { value: 45, experienceCheck: false },
      firearm: [{ specialty: 'Handgun', value: 60, experienceCheck: false }],
      meleeWeapon: [{ specialty: 'Sword', value: 35, experienceCheck: false }],
    },
    weapons: [
      { name: 'Fist', skill: 'Fighting (Brawl)', skillValue: 25, damage: '1D3+dm' },
      { name: 'Cutlass', skill: 'Fighting (Sword)', skillValue: 15, damage: '1d8+DB' },
      { name: '.38 Revolver', skill: 'Handgun', skillValue: 20, damage: '1d10' },
      { name: 'Net', skill: 'Trawling', skillValue: 12, damage: '' },
    ],
  } as unknown as CharacterData;

  it('rolls the damage modifier where the damage says so, in either notation', () => {
    const { combat } = getCharacterRolls('HORROR_D100', data);
    expect(combat.find((c) => c.label.startsWith('Fist Damage'))?.expression).toBe('1D3+1D4');
    expect(combat.find((c) => c.label.startsWith('Cutlass Damage'))?.expression).toBe('1d8+1D4');
  });

  it('drops the modifier for a character who has none', () => {
    const none = { ...(data as unknown as Record<string, unknown>), characteristics: { STR: 10, SIZ: 10 } } as unknown as CharacterData;
    expect(getCharacterRolls('HORROR_D100', none).combat.find((c) => c.label.startsWith('Fist Damage'))?.expression).toBe('1D3');
  });

  // As the sheet rolls it: a weapon with no value of its own rolls at the
  // skill it names, and offers no attack where the sheet has no such skill.
  it('offers a weapon stored with no skill value at the skill it names, and no attack where the sheet has none', () => {
    const sheet = {
      ...(data as unknown as Record<string, unknown>),
      weapons: [{ name: 'Fist', skill: 'Brawl', damage: '1D3' }, { name: 'Net', skill: 'Trawling', damage: '1D2' }],
    } as unknown as CharacterData;
    const labels = getCharacterRolls('HORROR_D100', sheet).combat.map((c) => c.label);
    expect(labels).toEqual(['Fist (Brawl, target: 45%)', 'Fist Damage (1D3)', 'Net Damage (1D2)']);
  });

  it('takes the skill value from the skill the weapon names, by its name today or the one the sheet used before', () => {
    const labels = getCharacterRolls('HORROR_D100', data).combat.map((c) => c.label);
    expect(labels).toContain('Fist (Fighting (Brawl), target: 45%)');
    expect(labels).toContain('Cutlass (Fighting (Sword), target: 35%)');
    expect(labels).toContain('.38 Revolver (Handgun, target: 60%)');
    // No such skill on the sheet: the value kept with the weapon.
    expect(labels).toContain('Net (Trawling, target: 12%)');
  });
});

// A value is offered as a roll only when the dice parser rolls what would be
// sent, which is what the server and a paused table roll by. The check looked
// at which characters a value held, so these were offered and then refused.
describe('values the dice cannot roll', () => {
  const fifthEditionStats = {
    strength:     { score: 10, modifier: 0 },
    dexterity:    { score: 10, modifier: 0 },
    constitution: { score: 14, modifier: 2 },
    intelligence: { score: 10, modifier: 0 },
    wisdom:       { score: 10, modifier: 0 },
    charisma:     { score: 10, modifier: 0 },
  };
  const purposes = (options: { purpose: string }[]) => options.map((o) => o.purpose);

  it('are not offered as 5E damage', () => {
    const data = {
      stats: fifthEditionStats,
      attacks: [
        { name: 'Spear', attackBonus: 4, damageRoll: '2d6+', additionalDamage: [{ label: 'Two hands', damageRoll: 'dddd' }] },
        { name: 'Dagger', attackBonus: 4, damageRoll: '1d4+2', additionalDamage: [{ label: 'Thrown', damageRoll: '1d4 + 2' }] },
      ],
    } as unknown as CharacterData;
    expect(purposes(getCharacterRolls('FIFTH_EDITION', data).combat)).toEqual([
      'Spear Attack', 'Dagger Attack', 'Dagger Damage', 'Dagger Damage (Thrown)',
    ]);
  });

  it('are not offered as Fantasy d20 strike damage', () => {
    const data = {
      ...fantasyD20Base,
      strikes: [
        { name: 'Longsword', attackBonus: 11, damageRoll: '1d8+4 S' },
        { name: 'Dagger', attackBonus: 10, damageRoll: '1d4+4' },
      ],
    } as unknown as CharacterData;
    expect(purposes(getCharacterRolls('FANTASY_D20', data).combat)).toEqual([
      'Longsword Strike', 'Dagger Strike', 'Dagger Damage',
    ]);
  });

  it('are not offered as Horror d100 weapon damage', () => {
    const data = {
      ...horrorD100Base,
      weapons: [
        { name: 'Knife', skill: 'Brawl', skillValue: 25, damage: '1d4+' },
        { name: 'Club', skill: 'Brawl', skillValue: 25, damage: '1d6+dm' },
      ],
    } as unknown as CharacterData;
    expect(purposes(getCharacterRolls('HORROR_D100', data).combat).filter((p) => p.endsWith('Damage'))).toEqual(['Club Damage']);
  });

  it('are not offered as a 5E hit die', () => {
    const data = {
      stats: fifthEditionStats,
      hitDice: [
        { class: 'fighter', die: 'dddd', maximum: 3, remaining: 3 },
        { class: 'monk', die: '200d6', maximum: 3, remaining: 3 },
        { class: 'rogue', die: 'd8', maximum: 3, remaining: 3 },
      ],
    } as unknown as CharacterData;
    expect(getCharacterRolls('FIFTH_EDITION', data).hitDice.map((h) => h.expression)).toEqual(['d8+2']);
  });

  // A hit die written with a + at its end rolled as the die plus Constitution
  // (`1d10++2`), and still does, without the stray sign.
  it('roll a hit die written with a + at its end as the die plus Constitution', () => {
    const data = { stats: fifthEditionStats, hitDice: [{ class: 'fighter', die: '1d10+', maximum: 3, remaining: 3 }] } as unknown as CharacterData;
    const [spend] = getCharacterRolls('FIFTH_EDITION', data).hitDice;
    expect(spend.expression).toBe('1d10+2');
    expect(spend.label).toBe('fighter 1d10 (3/3)');
  });

  it('are not offered as a 5E hit die that ends in another sign', () => {
    const data = {
      stats: fifthEditionStats,
      hitDice: ['d10/', '1d10-', 'd10*', '+'].map((die) => ({ class: 'fighter', die, maximum: 3, remaining: 3 })),
    } as unknown as CharacterData;
    expect(getCharacterRolls('FIFTH_EDITION', data).hitDice).toEqual([]);
  });
});
