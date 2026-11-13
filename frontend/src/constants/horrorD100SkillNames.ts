// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * The Horror d100 sheet's skills as it lists them: the open d100 rules'
 * categories, each skill's name, and which take an experience check. The
 * sheet's skill list and the roll menu both read them here, so a skill is
 * called the same, and comes in the same place, in both.
 */

import {
  HORROR_D100_BLASPHEMOUS_LORE,
  HORROR_D100_FIXED_SKILLS,
  HORROR_D100_SPECIALISED_SKILLS,
  type HorrorD100FixedSkillKey,
  type HorrorD100SpecialisedSkillKey,
} from '@/utils/rules/horrorD100';

/** One line of a skill category: a skill with one rating, the character's own language, or a list of specialties. */
export type HorrorD100SkillEntry =
  | { kind: 'fixed'; key: HorrorD100FixedSkillKey }
  | { kind: 'languageOwn' }
  | { kind: 'list'; key: HorrorD100SpecialisedSkillKey };

const fixed = (key: HorrorD100FixedSkillKey): HorrorD100SkillEntry => ({ kind: 'fixed', key });
const list = (key: HorrorD100SpecialisedSkillKey): HorrorD100SkillEntry => ({ kind: 'list', key });

/**
 * The skills by category, each category in the rules' order (open d100
 * rules, p. 32, Skill List by Category). Language is the character's own,
 * then the others. The sheet's skill list and the roll menu both read it
 * here, so they list the skills in the same order.
 */
export const HORROR_D100_SKILL_CATEGORIES: readonly { name: string; skills: readonly HorrorD100SkillEntry[] }[] = [
  {
    name: 'Combat',
    skills: [
      list('artillery'), fixed('brawl'), list('energyWeapon'), list('firearm'), fixed('grapple'), list('heavyWeapon'),
      fixed('martialArts'), list('meleeWeapon'), list('missileWeapon'), list('parry'), list('shield'),
    ],
  },
  {
    name: 'Communication',
    skills: [
      fixed('bargain'), fixed('command'), fixed('disguise'), list('etiquette'), fixed('fastTalk'), { kind: 'languageOwn' },
      list('languageOther'), fixed('perform'), fixed('persuade'), fixed('status'), fixed('teach'),
    ],
  },
  {
    name: 'Manipulation',
    skills: [
      list('art'), list('craft'), fixed('demolition'), fixed('fineManipulation'), list('heavyMachine'), list('repair'),
      fixed('sleightOfHand'),
    ],
  },
  {
    name: 'Mental',
    skills: [
      fixed('appraise'), fixed('firstAid'), fixed('gaming'), list('knowledge'), fixed('medicine'), fixed('psychotherapy'),
      list('science'), fixed('strategy'), list('technicalSkill'),
    ],
  },
  {
    name: 'Perception',
    skills: [fixed('insight'), fixed('listen'), fixed('navigate'), fixed('research'), fixed('sense'), fixed('spot'), fixed('track')],
  },
  {
    name: 'Physical',
    skills: [
      fixed('climb'), fixed('dodge'), list('drive'), fixed('hide'), fixed('jump'), list('pilot'), list('ride'),
      fixed('stealth'), fixed('swim'), fixed('throw'),
    ],
  },
];

/** The name the character's own language is listed under. */
export const HORROR_D100_OWN_LANGUAGE_NAME = 'Language (Own)';

/**
 * The name of one specialty of a skill: "Knowledge (Occult)", "Language
 * (Latin)". A specialty not yet named is listed under the skill's own name.
 */
export function horrorD100SpecialtyName(key: HorrorD100SpecialisedSkillKey, specialty: string): string {
  if (specialty.trim() === '') return HORROR_D100_SPECIALISED_SKILLS[key].name;
  return key === 'languageOther' ? `Language (${specialty})` : `${HORROR_D100_SPECIALISED_SKILLS[key].name} (${specialty})`;
}

/** Whether a Knowledge specialty is Blasphemous Lore, however it was typed. */
export function isHorrorD100BlasphemousLore(specialty: unknown): boolean {
  return typeof specialty === 'string' && specialty.trim().toLowerCase() === HORROR_D100_BLASPHEMOUS_LORE.toLowerCase();
}

/**
 * Whether a skill takes an experience check. Status is not raised by
 * experience (open d100 rules, p. 51, Status), nor is Knowledge (Blasphemous
 * Lore) (p. 43, Knowledge Specialties).
 */
export function horrorD100TakesExperienceCheck(key: string, specialty?: unknown): boolean {
  if (key === 'status') return false;
  return !(key === 'knowledge' && isHorrorD100BlasphemousLore(specialty));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Every skill a sheet holds a rating for, by the name the sheet lists it
 * under, in the sheet's order: each category's, then the character's own. An
 * own skill with no name is left out, since there is nothing to call it.
 */
export function horrorD100NamedSkills(skills: unknown): { name: string; value: number }[] {
  if (!isRecord(skills)) return [];
  const named: { name: string; value: number }[] = [];
  const add = (name: string, entry: unknown) => {
    if (isRecord(entry) && typeof entry.value === 'number' && Number.isFinite(entry.value)) named.push({ name, value: entry.value });
  };
  const entries = (key: string): unknown[] => {
    const held = skills[key];
    return Array.isArray(held) ? held : [];
  };
  for (const category of HORROR_D100_SKILL_CATEGORIES) {
    for (const skill of category.skills) {
      if (skill.kind === 'fixed') add(HORROR_D100_FIXED_SKILLS[skill.key].name, skills[skill.key]);
      else if (skill.kind === 'languageOwn') add(HORROR_D100_OWN_LANGUAGE_NAME, skills.languageOwn);
      else {
        for (const entry of entries(skill.key)) {
          add(horrorD100SpecialtyName(skill.key, isRecord(entry) && typeof entry.specialty === 'string' ? entry.specialty : ''), entry);
        }
      }
    }
  }
  for (const entry of entries('own')) {
    if (isRecord(entry) && typeof entry.name === 'string' && entry.name.trim() !== '') add(entry.name, entry);
  }
  return named;
}
