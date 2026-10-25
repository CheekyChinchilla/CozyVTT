/**
 * The specialisations the Keeper Rulebook lists for the Call of Cthulhu
 * skills that have them, with their base values, offered when a player adds
 * one. "Other" adds one to be named, at a base of 1.
 *
 * Brawl, Handgun, Rifle and Shotgun are printed on the sheet already, so they
 * are not offered again. The rulebook's Rifle/Shotgun is one skill; the sheet
 * has kept them as two rows since it was first written.
 */

export interface CoCSpecialisation {
  name: string;
  base: number;
}

/** Fighting specialisations ("Axe (15%)" and so on). */
export const COC_FIGHTING_SPECIALISATIONS: readonly CoCSpecialisation[] = [
  { name: 'Axe', base: 15 },
  { name: 'Chainsaw', base: 10 },
  { name: 'Flail', base: 10 },
  { name: 'Garrote', base: 15 },
  { name: 'Spear', base: 20 },
  { name: 'Sword', base: 20 },
  { name: 'Whip', base: 5 },
];

/** Firearms specialisations ("Bow (15%)" and so on). */
export const COC_FIREARMS_SPECIALISATIONS: readonly CoCSpecialisation[] = [
  { name: 'Bow', base: 15 },
  { name: 'Flamethrower', base: 10 },
  { name: 'Heavy Weapons', base: 10 },
  { name: 'Machine Gun', base: 10 },
  { name: 'Submachine Gun', base: 15 },
];

/** Science specialisations, each 01%. */
export const COC_SCIENCE_SPECIALISATIONS: readonly CoCSpecialisation[] = [
  'Astronomy', 'Biology', 'Botany', 'Chemistry', 'Cryptography', 'Engineering', 'Forensics',
  'Geology', 'Mathematics', 'Meteorology', 'Pharmacy', 'Physics', 'Zoology',
].map((name) => ({ name, base: 1 }));

/** The choice that adds a specialisation to be named. */
export const COC_OTHER_SPECIALISATION: CoCSpecialisation = { name: 'Other', base: 1 };
