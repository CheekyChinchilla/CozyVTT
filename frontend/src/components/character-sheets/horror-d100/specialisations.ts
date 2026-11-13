// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * The specialties offered when a player adds one to a Horror d100 skill that
 * has them, with the base chance each starts at. "Other" adds one to be
 * named, at the skill's own base chance. A specialty a sheet already holds is
 * kept and shown whether or not it is offered here.
 *
 * They are the open d100 rules' own lists. Melee Weapon offers the melee
 * weapon classes (open d100 rules, pp. 196-197, Weapon Classes), each at the
 * base most of that class's weapons have in the rules' weapon tables (those
 * tables give a base per weapon, and no class has one of its own). Staff has
 * two weapons, the quarter-staff at 25 and the short staff at 15 (p. 200),
 * and is offered at the lower. Firearm offers the firearm specialties, each
 * at the base its weapons share, and Handgun, which the rules' professions
 * name;
 * Knowledge offers the specialties the rules list; Science offers the
 * sciences, each at 1%.
 */

import { HORROR_D100_BLASPHEMOUS_LORE, HORROR_D100_SPECIALISED_SKILLS, type HorrorD100SpecialisedSkillKey } from '@/utils/rules/horrorD100';

export interface HorrorD100Specialisation {
  name: string;
  base: number;
}

/** The melee weapon classes ("Axe (15%)" and so on). */
const MELEE_WEAPON_SPECIALTIES: readonly HorrorD100Specialisation[] = [
  { name: 'Axe', base: 15 },
  { name: 'Club', base: 25 },
  { name: 'Dagger', base: 25 },
  { name: 'Flail', base: 10 },
  { name: 'Hammer', base: 25 },
  { name: 'Hand', base: 25 },
  { name: 'Mace', base: 25 },
  { name: 'Polearm', base: 15 },
  { name: 'Spear', base: 15 },
  { name: 'Staff', base: 15 },
  { name: 'Sword', base: 15 },
];

/** The sciences, each at 1% (open d100 rules, pp. 49-50, Science). */
const SCIENCE_SPECIALTIES: readonly HorrorD100Specialisation[] = [
  'Astronomy', 'Behavioral Science', 'Biology', 'Botany', 'Chemistry', 'Cryptography', 'Genetics', 'Geology',
  'Mathematics', 'Meteorology', 'Natural History', 'Pharmacology', 'Physics', 'Planetology', 'Psychology',
  'Quantum Mechanics', 'Xenobiology', 'Zoology',
].map((name) => ({ name, base: 1 }));

/**
 * The firearm specialties, each at the base its weapons share in the rules'
 * tables (open d100 rules, p. 39, Firearm; pp. 201-202, Modern Missile
 * Weapons). Handgun is the specialty the Detective profession names (p. 22,
 * Detective); a handgun is a pistol or a revolver, and every one of those in
 * that table starts at 20.
 */
const FIREARM_SPECIALTIES: readonly HorrorD100Specialisation[] = [
  { name: 'Handgun', base: 20 },
  { name: 'Machine Gun', base: 15 },
  { name: 'Pistol', base: 20 },
  { name: 'Revolver', base: 20 },
  { name: 'Rifle', base: 25 },
  { name: 'Shotgun', base: 30 },
  { name: 'Submachine Gun', base: 15 },
];

/**
 * The Knowledge specialties the rules list (open d100 rules, pp. 43-44,
 * Knowledge Specialties), each at 5%, the base of a common field; the GM may
 * rule that one starts at 0%. Blasphemous Lore starts at 0%.
 */
const KNOWLEDGE_SPECIALTIES: readonly HorrorD100Specialisation[] = [
  'Academic Lore', 'Accounting', 'Anthropology', 'Archaeology', 'Art History', HORROR_D100_BLASPHEMOUS_LORE, 'Business',
  'Espionage', 'Folklore', 'Group', 'History', 'Law', 'Linguistics', 'Literature', 'Occult', 'Philosophy', 'Politics',
  'Region', 'Religion', 'Streetwise',
].map((name) => ({ name, base: name === HORROR_D100_BLASPHEMOUS_LORE ? 0 : 5 }));

/**
 * The specialties offered when a player adds one to a skill that has them,
 * with the base chance each starts at. A skill not listed here offers none:
 * its add button adds a specialty to be named, at the skill's base chance.
 */
export const HORROR_D100_SPECIALTIES_OFFERED: Partial<Record<HorrorD100SpecialisedSkillKey, readonly HorrorD100Specialisation[]>> = {
  firearm: FIREARM_SPECIALTIES,
  knowledge: KNOWLEDGE_SPECIALTIES,
  meleeWeapon: MELEE_WEAPON_SPECIALTIES,
  science: SCIENCE_SPECIALTIES,
};

/**
 * The base chance of one specialty: the one it is offered at, or else the
 * skill's own. Null where each weapon or shield has a base of its own and
 * this is none of those offered.
 */
export function horrorD100SpecialtyBase(key: HorrorD100SpecialisedSkillKey, specialty: string): number | null {
  const wanted = specialty.trim().toLowerCase();
  const offered = HORROR_D100_SPECIALTIES_OFFERED[key]?.find((choice) => choice.name.toLowerCase() === wanted);
  return offered ? offered.base : HORROR_D100_SPECIALISED_SKILLS[key].base;
}
