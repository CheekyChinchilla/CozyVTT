/**
 * The open d100 rules the rebuilt Horror d100 sheet works out: the
 * characteristic rolls, hit points, the major wound level, power points, the
 * damage modifier, the experience bonus, MOV, maximum Sanity, the skill list
 * and its base chances, and the weapon's skill and damage readers.
 *
 * Each expected number was checked against the open d100 rules' text; the
 * worked examples are the rules' own.
 */

import {
  HORROR_D100_CHARACTERISTIC_ROLLS,
  HORROR_D100_FIXED_SKILLS,
  HORROR_D100_HUMAN_MOVE,
  HORROR_D100_SANITY_CEILING,
  HORROR_D100_SPECIALISED_SKILLS,
  horrorD100CharacteristicRoll,
  horrorD100DamageModifier,
  horrorD100DamageWithModifier,
  horrorD100ExperienceBonus,
  horrorD100FixedSkillBase,
  horrorD100LanguageOwnBase,
  horrorD100MajorWoundLevel,
  horrorD100MaximumHitPoints,
  horrorD100MaximumPowerPoints,
  horrorD100MaximumSanity,
  horrorD100NewSkills,
  horrorD100WeaponSkillRating,
} from '../horrorD100';
import fs from 'fs';
import path from 'path';

describe('the characteristic rolls', () => {
  it('are five times the characteristic', () => {
    expect(horrorD100CharacteristicRoll(12)).toBe(60);
    expect(horrorD100CharacteristicRoll(3)).toBe(15);
    expect(horrorD100CharacteristicRoll(21)).toBe(105);
  });

  it('are named as the rules name them, Knowledge for the optional EDU, and none for SIZ', () => {
    expect(HORROR_D100_CHARACTERISTIC_ROLLS).toEqual({
      STR: 'Effort', CON: 'Stamina', INT: 'Idea', POW: 'Luck', DEX: 'Agility', CHA: 'Charm', EDU: 'Knowledge',
    });
  });
});

describe('hit points', () => {
  it('are CON plus SIZ, halved and rounded up', () => {
    // The rules' example: CON 16 and SIZ 14 give 15, and CON 10 gives 12.
    expect(horrorD100MaximumHitPoints(16, 14)).toBe(15);
    expect(horrorD100MaximumHitPoints(10, 14)).toBe(12);
    expect(horrorD100MaximumHitPoints(11, 10)).toBe(11);
    expect(horrorD100MaximumHitPoints(0, 0)).toBe(0);
  });

  it('give a major wound level of half, rounded up', () => {
    // The same example: the level drops from 8 to 6.
    expect(horrorD100MajorWoundLevel(15)).toBe(8);
    expect(horrorD100MajorWoundLevel(12)).toBe(6);
    expect(horrorD100MajorWoundLevel(0)).toBe(0);
  });
});

describe('power points', () => {
  it('are POW', () => {
    expect(horrorD100MaximumPowerPoints(12)).toBe(12);
    expect(horrorD100MaximumPowerPoints(0)).toBe(0);
  });
});

describe('the damage modifier', () => {
  it.each([
    [1, 1, '-1D6'],
    [6, 6, '-1D6'],
    [6, 7, '-1D4'],
    [8, 8, '-1D4'],
    [8, 9, 'None'],
    [12, 12, 'None'],
    [12, 13, '+1D4'],
    [16, 16, '+1D4'],
    [16, 17, '+1D6'],
    [20, 20, '+1D6'],
    [20, 21, '+2D6'],
    [28, 28, '+2D6'],
    [28, 29, '+3D6'],
    [36, 36, '+3D6'],
    [36, 37, '+4D6'],
    [44, 44, '+4D6'],
    [44, 45, '+5D6'],
    [52, 52, '+5D6'],
    [52, 53, '+6D6'],
    [60, 60, '+6D6'],
    [60, 61, '+7D6'],
    [68, 68, '+7D6'],
    [68, 69, '+8D6'],
    [76, 76, '+8D6'],
    [76, 77, '+9D6'],
    [84, 84, '+9D6'],
    [84, 85, '+10D6'],
  ])('for STR %i and SIZ %i is %s', (str, siz, modifier) => {
    expect(horrorD100DamageModifier(str, siz)).toBe(modifier);
  });
});

describe('the experience bonus', () => {
  it('is half INT, rounded up', () => {
    expect(horrorD100ExperienceBonus(13)).toBe(7);
    expect(horrorD100ExperienceBonus(12)).toBe(6);
    expect(horrorD100ExperienceBonus(0)).toBe(0);
  });
});

describe('MOV', () => {
  it('is 10 for a human', () => {
    expect(HORROR_D100_HUMAN_MOVE).toBe(10);
  });
});

describe('maximum Sanity', () => {
  it('is 100 less Knowledge (Blasphemous Lore)', () => {
    // The rules' example: Blasphemous Lore 43 gives a maximum of 57.
    expect(horrorD100MaximumSanity(43)).toBe(57);
    expect(horrorD100MaximumSanity(3)).toBe(97);
    expect(horrorD100MaximumSanity(99)).toBe(1);
  });

  it('is never above 99, nor below 0', () => {
    expect(HORROR_D100_SANITY_CEILING).toBe(99);
    expect(horrorD100MaximumSanity(0)).toBe(99);
    expect(horrorD100MaximumSanity(150)).toBe(0);
  });
});

describe('the skill list', () => {
  it('gives each skill with one rating its base chance', () => {
    const bases = Object.fromEntries(Object.entries(HORROR_D100_FIXED_SKILLS).map(([key, skill]) => [key, skill.base]));
    expect(bases).toEqual({
      appraise: 15, bargain: 5, brawl: 25, climb: 40, command: 5, demolition: 1, disguise: 1, dodge: 'DEX×2',
      fastTalk: 5, fineManipulation: 5, firstAid: 30, gaming: 'INT+POW', grapple: 25, hide: 10, insight: 5,
      jump: 25, listen: 25, martialArts: 1, medicine: 5, navigate: 10, perform: 5, persuade: 15,
      psychotherapy: 1, research: 25, sense: 10, sleightOfHand: 5, spot: 25, status: 15, stealth: 10,
      strategy: 1, swim: 25, teach: 10, throw: 25, track: 10,
    });
  });

  it('gives each specialised skill its base chance, or none where each weapon or shield has its own', () => {
    const bases = Object.fromEntries(Object.entries(HORROR_D100_SPECIALISED_SKILLS).map(([key, skill]) => [key, skill.base]));
    expect(bases).toEqual({
      art: 5, artillery: null, craft: 5, drive: 20, energyWeapon: null, etiquette: 5, firearm: null,
      heavyMachine: 1, heavyWeapon: null, knowledge: 5, languageOther: 0, meleeWeapon: null,
      missileWeapon: null, parry: null, pilot: 1, repair: 15, ride: 5, science: 1, shield: null,
      technicalSkill: 5,
    });
  });

  it('works out Dodge from DEX and Gaming from INT and POW', () => {
    const characteristics = { DEX: 13, INT: 16, POW: 12 };
    expect(horrorD100FixedSkillBase('dodge', characteristics)).toBe(26);
    expect(horrorD100FixedSkillBase('gaming', characteristics)).toBe(28);
    expect(horrorD100FixedSkillBase('climb', characteristics)).toBe(40);
    expect(horrorD100FixedSkillBase('dodge', {})).toBe(0);
  });

  it('starts the own language at five times INT, or EDU when that is higher', () => {
    expect(horrorD100LanguageOwnBase(14)).toBe(70);
    expect(horrorD100LanguageOwnBase(14, 17)).toBe(85);
    expect(horrorD100LanguageOwnBase(14, 10)).toBe(70);
  });

  it('starts a new character with every skill at its base and every specialised skill empty', () => {
    const skills = horrorD100NewSkills({ DEX: 10, INT: 13, POW: 11 });
    for (const key of Object.keys(HORROR_D100_FIXED_SKILLS) as (keyof typeof HORROR_D100_FIXED_SKILLS)[]) {
      expect(skills[key]).toEqual({ value: horrorD100FixedSkillBase(key, { DEX: 10, INT: 13, POW: 11 }), experienceCheck: false });
    }
    for (const key of Object.keys(HORROR_D100_SPECIALISED_SKILLS) as (keyof typeof HORROR_D100_SPECIALISED_SKILLS)[]) expect(skills[key]).toEqual([]);
    expect(skills.languageOwn).toEqual({ language: '', value: 65, experienceCheck: false });
    expect(skills.own).toEqual([]);
    expect(Object.keys(skills).sort()).toEqual(
      [...Object.keys(HORROR_D100_FIXED_SKILLS), ...Object.keys(HORROR_D100_SPECIALISED_SKILLS), 'languageOwn', 'own'].sort()
    );
  });
});

describe('a weapon\'s skill on the rebuilt sheet', () => {
  const rating = (value: number) => ({ value, experienceCheck: false });
  const skills = {
    brawl: rating(50),
    throw: rating(35),
    fastTalk: rating(40),
    firearm: [
      { specialty: 'Handgun', ...rating(55) },
      { specialty: 'Rifle', ...rating(30) },
      { specialty: 'Shotgun', ...rating(45) },
      { specialty: 'Bow', ...rating(22) },
    ],
    meleeWeapon: [{ specialty: 'Sword', ...rating(41) }],
    missileWeapon: [{ specialty: 'Crossbow', ...rating(33) }],
    knowledge: [{ specialty: 'Occult', ...rating(60) }],
    languageOwn: { language: 'Welsh', ...rating(70) },
    languageOther: [{ specialty: 'Latin', ...rating(25) }],
    own: [{ name: 'Charm', ...rating(52) }, { name: 'Survival (Desert)', ...rating(31) }],
  };

  it.each([
    ['Brawl', 50],
    ['Fighting (Brawl)', 50],
    ['Firearm (Handgun)', 55],
    ['Firearms (Handgun)', 55],
    ['Handgun', 55],
    ['Rifle/Shotgun', 45],
    ['Rifle or Shotgun', 45],
    ['Firearm (Rifle)', 30],
    ['Firearms (Bow)', 22],
    ['Melee Weapon (Sword)', 41],
    ['Fighting (Sword)', 41],
    ['Sword', 41],
    ['Missile Weapon (Crossbow)', 33],
    ['Knowledge (Occult)', 60],
    ['Language (Own)', 70],
    ['Language (Latin)', 25],
    ['Throw', 35],
    ['fast talk', 40],
    ['Charm', 52],
    ['Survival (Desert)', 31],
  ])('named %s is read at %i', (name, expected) => {
    expect(horrorD100WeaponSkillRating(skills, name, 7)).toBe(expected);
  });

  it('falls back to the weapon\'s stored copy where the sheet has no such skill', () => {
    expect(horrorD100WeaponSkillRating(skills, 'Firearm (Machine Gun)', 7)).toBe(7);
    expect(horrorD100WeaponSkillRating(skills, 'Whip', 7)).toBe(7);
    expect(horrorD100WeaponSkillRating(skills, '', 7)).toBe(7);
    expect(horrorD100WeaponSkillRating(undefined, 'Brawl', 7)).toBe(7);
    expect(horrorD100WeaponSkillRating({ brawl: { value: 'high' } }, 'Brawl', 7)).toBe(7);
  });
});

describe('a weapon\'s damage with the damage modifier written in', () => {
  it('reads the open rules\' notation, full and halved', () => {
    expect(horrorD100DamageWithModifier('1D3+dm', '+1D4')).toBe('1D3+1D4');
    expect(horrorD100DamageWithModifier('1D6+1 + dm', '-1D4')).toBe('1D6+1-1D4');
    expect(horrorD100DamageWithModifier('1D8+½dm', 'None')).toBe('1D8');
    expect(horrorD100DamageWithModifier('1D8+½dm', '+1D6')).toBe('1D8+½dm');
  });

  it('drops the modifier where the table gives none', () => {
    expect(horrorD100DamageWithModifier('1D3+dm', 'None')).toBe('1D3');
    expect(horrorD100DamageWithModifier('1D3+dm', 'none')).toBe('1D3');
  });

  it('still reads the notation the sheet used before it was rebuilt', () => {
    expect(horrorD100DamageWithModifier('1D3+DB', '+1D4')).toBe('1D3+1D4');
    expect(horrorD100DamageWithModifier('1D3+DB', '0')).toBe('1D3');
  });

  it('leaves a word that only starts with the letters alone', () => {
    expect(horrorD100DamageWithModifier('1D6+dmg', '+1D4')).toBe('1D6+dmg');
  });
});

describe('the citations of the open d100 rules', () => {
  const root = path.resolve(__dirname, '../../../../..');

  /** Every source file of both packages, by its path from the repository root. */
  function sources(dir: string): string[] {
    return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(rel);
      return /\.tsx?$/.test(entry.name) ? [rel] : [];
    });
  }

  it('name a page and a section of the published document, never a line of a local copy', () => {
    const lineCited = [...sources('backend/src'), ...sources('frontend/src')]
      .filter((rel) => /\bOR:\d/.test(fs.readFileSync(path.join(root, rel), 'utf8')));
    expect(lineCited).toEqual([]);
  });

  it('are given for the rules\' numbers', () => {
    const rules = fs.readFileSync(path.join(root, 'backend/src/utils/rules/horrorD100.ts'), 'utf8');
    expect(rules.match(/open d100 rules, pp?\. \d+(-\d+)?, [A-Z]/g)?.length ?? 0).toBeGreaterThanOrEqual(20);
  });
});
