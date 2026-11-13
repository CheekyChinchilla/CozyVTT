/**
 * The rebuilt Horror d100 sheet lists every skill the sheet stores, once, by
 * the open d100 rules' categories, and names each as the rules do.
 */

import { describe, it, expect } from 'vitest';
import {
  HORROR_D100_SKILL_CATEGORIES,
  horrorD100NamedSkills,
  horrorD100SpecialtyName,
  horrorD100TakesExperienceCheck,
  isHorrorD100BlasphemousLore,
} from '../horrorD100SkillNames';
import { HORROR_D100_FIXED_SKILLS, HORROR_D100_SPECIALISED_SKILLS, horrorD100NewSkills } from '@/utils/rules/horrorD100';

describe('the skill categories', () => {
  it('are the rules\' six', () => {
    expect(HORROR_D100_SKILL_CATEGORIES.map((category) => category.name)).toEqual(['Combat', 'Communication', 'Manipulation', 'Mental', 'Perception', 'Physical']);
  });

  it('hold every skill of the sheet exactly once', () => {
    const listed = HORROR_D100_SKILL_CATEGORIES.flatMap((category) => category.skills.map((skill) => (skill.kind === 'languageOwn' ? 'languageOwn' : skill.key)));
    const stored = [...Object.keys(HORROR_D100_FIXED_SKILLS), ...Object.keys(HORROR_D100_SPECIALISED_SKILLS), 'languageOwn'];
    expect([...listed].sort()).toEqual([...stored].sort());
  });

  it('put a skill where the rules do', () => {
    const categoryOf = (key: string) => HORROR_D100_SKILL_CATEGORIES.find((category) => category.skills.some((skill) => skill.kind !== 'languageOwn' && skill.key === key))?.name;
    expect(categoryOf('firstAid')).toBe('Mental');
    expect(categoryOf('disguise')).toBe('Communication');
    expect(categoryOf('navigate')).toBe('Perception');
    expect(categoryOf('drive')).toBe('Physical');
    expect(categoryOf('heavyMachine')).toBe('Manipulation');
    expect(categoryOf('shield')).toBe('Combat');
  });
});

describe('a specialty\'s name', () => {
  it('follows its skill, and a language follows Language', () => {
    expect(horrorD100SpecialtyName('knowledge', 'Occult')).toBe('Knowledge (Occult)');
    expect(horrorD100SpecialtyName('meleeWeapon', 'Sword')).toBe('Melee Weapon (Sword)');
    expect(horrorD100SpecialtyName('languageOther', 'Latin')).toBe('Language (Latin)');
  });

  it('is the skill\'s own while the specialty has none', () => {
    expect(horrorD100SpecialtyName('ride', '')).toBe('Ride');
    expect(horrorD100SpecialtyName('languageOther', '  ')).toBe('Language (Other)');
  });
});

describe('experience checks', () => {
  it('are taken by every skill but Status and Knowledge (Blasphemous Lore)', () => {
    expect(horrorD100TakesExperienceCheck('spot')).toBe(true);
    expect(horrorD100TakesExperienceCheck('knowledge', 'Occult')).toBe(true);
    expect(horrorD100TakesExperienceCheck('science', 'Blasphemous Lore')).toBe(true);
    expect(horrorD100TakesExperienceCheck('status')).toBe(false);
    expect(horrorD100TakesExperienceCheck('knowledge', ' blasphemous LORE ')).toBe(false);
    expect(isHorrorD100BlasphemousLore(undefined)).toBe(false);
  });
});

describe('the skills a sheet holds a rating for', () => {
  it('are named in the sheet\'s order, the character\'s own last', () => {
    const skills = {
      ...horrorD100NewSkills({ DEX: 10, INT: 10, POW: 10 }),
      firearm: [{ specialty: 'Rifle', value: 40, experienceCheck: false }],
      languageOther: [{ specialty: '', value: 0, experienceCheck: false }],
      ride: [{ specialty: '', value: 35, experienceCheck: false }],
      own: [{ name: 'Charm', value: 55, experienceCheck: true }, { name: ' ', value: 20, experienceCheck: false }],
    };
    const named = horrorD100NamedSkills(skills);
    expect(named.slice(0, 3)).toEqual([{ name: 'Brawl', value: 25 }, { name: 'Firearm (Rifle)', value: 40 }, { name: 'Grapple', value: 25 }]);
    expect(named).toContainEqual({ name: 'Language (Own)', value: 50 });
    expect(named).toContainEqual({ name: 'Language (Other)', value: 0 });
    expect(named).toContainEqual({ name: 'Ride', value: 35 });
    expect(named[named.length - 1]).toEqual({ name: 'Charm', value: 55 });
    expect(named).toHaveLength(34 + 1 + 3 + 1);
  });

  it('are none for a sheet with no skills, and leave out a row with no rating', () => {
    expect(horrorD100NamedSkills(undefined)).toEqual([]);
    expect(horrorD100NamedSkills({ spot: { value: 'high' }, climb: 40, knowledge: 'none' })).toEqual([]);
  });
});
