// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * rules/horrorD100.ts
 * The Horror d100 sheet's rules, from the open d100 rules: the rolls a
 * characteristic gives, the derived attributes worked out from a character's
 * characteristics, and the skills with their base chances.
 *
 * Each number cites the page and section of the open d100 rules' ORC content
 * document that gives it, as "open d100 rules, p. 7, Step Four:
 * Characteristic Rolls".
 *
 * ---------------------------------------------------------------------------
 * DUPLICATED FILE — these two copies must stay byte-for-byte identical:
 *   frontend/src/utils/rules/horrorD100.ts
 *   backend/src/utils/rules/horrorD100.ts
 * ---------------------------------------------------------------------------
 * The sheets work these out, and the backend suite checks the built-in
 * templates against them, so a template cannot ship a number that does not
 * follow from its own characteristics. A parity test fails on any difference.
 */

/**
 * A weapon's damage with the damage modifier written in. The open d100 rules
 * write it as "+dm" (open d100 rules, p. 190, Weapons; "1D3+dm" for a fist,
 * p. 197, Primitive Melee Weapons), and the sheet before it was rebuilt wrote "+DB"; the dice
 * read neither. A modifier of 0, or "None" as the rules' table gives it
 * (p. 13, Damage Modifier Table), drops it, a negative one is subtracted, and
 * a die is added. A firearm adds no modifier (p. 13, Damage Modifier), so a
 * gun's damage has none to replace.
 *
 * A thrown weapon or a bow adds half the modifier ("+½dm", p. 190, Weapons;
 * "1D3+½dm" for a thrown knife, p. 198, Primitive Missile Weapons; or
 * "1D3+half DB"). Half of none is none and is dropped; there
 * is no way to halve dice, so any other half modifier is left as written.
 */
export function horrorD100DamageWithModifier(damage: string, damageModifier: string): string {
  const modifier = damageModifier.trim();
  const none = modifier === '' || modifier === '0' || modifier.toLowerCase() === 'none';
  const written = none ? '' : modifier.startsWith('-') || modifier.startsWith('+') ? modifier : `+${modifier}`;
  const full = damage.replace(/\s*\+\s*(?:DB|dm)\b/gi, written);
  return none ? full.replace(/\s*\+\s*(?:half|½|1\/2)\s*(?:DB|dm)\b/gi, '') : full;
}

/** Whether a value is an object with fields, not a list. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A characteristic as a number, or 0 where the sheet has none. */
function characteristicOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** A skill's rating, or null where the entry has none. */
function ratingOf(entry: unknown): number | null {
  if (!isRecord(entry)) return null;
  const { value } = entry;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The roll each characteristic gives, at five times the characteristic: STR
 * for Effort, CON for Stamina, INT for Idea, POW for Luck, DEX for Agility
 * and CHA for Charm, and the optional EDU for Knowledge (open d100 rules,
 * p. 7, Step Four: Characteristic Rolls). SIZ gives none.
 */
export const HORROR_D100_CHARACTERISTIC_ROLLS = {
  STR: 'Effort',
  CON: 'Stamina',
  INT: 'Idea',
  POW: 'Luck',
  DEX: 'Agility',
  CHA: 'Charm',
  EDU: 'Knowledge',
} as const;

/**
 * A characteristic roll's chance: five times the characteristic (open d100
 * rules, p. 7, Step Four: Characteristic Rolls).
 */
export function horrorD100CharacteristicRoll(characteristic: number): number {
  return characteristic * 5;
}

/**
 * Maximum hit points: CON plus SIZ, halved and rounded up (open d100 rules,
 * p. 7, Step Five: Derived Characteristics; p. 14, Hit Points).
 */
export function horrorD100MaximumHitPoints(con: number, siz: number): number {
  return Math.ceil((con + siz) / 2);
}

/**
 * The major wound level: half the maximum hit points, rounded up (open d100
 * rules, p. 7, Step Five: Derived Characteristics; p. 14, Major Wounds). A
 * wound of that much damage at once is a major wound.
 */
export function horrorD100MajorWoundLevel(maximumHitPoints: number): number {
  return Math.ceil(maximumHitPoints / 2);
}

/**
 * Maximum power points: equal to POW (open d100 rules, p. 7, Step Five: Derived
 * Characteristics; p. 15, Power Points).
 */
export function horrorD100MaximumPowerPoints(pow: number): number {
  return pow;
}

/**
 * The damage modifier for STR plus SIZ, from the rules' table (open d100
 * rules, p. 13, Damage Modifier Table): up to 12 takes 1D6 off, 13 to 16
 * takes 1D4 off, 17 to 24 is none, 25 to 32 adds 1D4, 33 to 40 adds 1D6, 41
 * to 56 adds 2D6, and every 16 points past 56, or part of 16, one more D6.
 * The table starts at 2; a total below that takes its lowest row.
 */
export function horrorD100DamageModifier(str: number, siz: number): string {
  const total = str + siz;
  if (total <= 12) return '-1D6';
  if (total <= 16) return '-1D4';
  if (total <= 24) return 'None';
  if (total <= 32) return '+1D4';
  if (total <= 40) return '+1D6';
  return `+${2 + Math.max(0, Math.ceil((total - 56) / 16))}D6`;
}

/**
 * The experience bonus: half INT, rounded up (open d100 rules, p. 7, Step Five:
 * Derived Characteristics; p. 13, Experience Bonus).
 */
export function horrorD100ExperienceBonus(int: number): number {
  return Math.ceil(int / 2);
}

/**
 * A human's MOV, which humanoid characters start with too (open d100 rules,
 * p. 7, Step Five: Derived Characteristics; p. 15, Movement).
 */
export const HORROR_D100_HUMAN_MOVE = 10;

/**
 * The most Sanity a character can have, whatever raises it (open d100 rules,
 * p. 16, Sanity Points).
 */
export const HORROR_D100_SANITY_CEILING = 99;

/**
 * Maximum Sanity: 100 less the character's Knowledge (Blasphemous Lore)
 * (open d100 rules, p. 260, Maximum Sanity), never above 99 (p. 16, Sanity
 * Points) nor below 0. A passage on lore books gives 99 less the skill
 * (p. 222, Types of Books); the Sanity rules' own figure is the one used.
 */
export function horrorD100MaximumSanity(blasphemousLore: number): number {
  return Math.max(0, Math.min(HORROR_D100_SANITY_CEILING, 100 - blasphemousLore));
}

/**
 * The Knowledge specialty that lowers maximum Sanity. It starts at 0 and
 * cannot be raised by experience (open d100 rules, p. 43, Knowledge
 * Specialties).
 */
export const HORROR_D100_BLASPHEMOUS_LORE = 'Blasphemous Lore';

/**
 * The open d100 rules' skills that have one rating each, by the key the
 * sheet stores each under, with its base chance (open d100 rules, pp. 33-34,
 * Alphabetical Skill List). Dodge's is
 * twice DEX and Gaming's INT plus POW, worked out by horrorD100FixedSkillBase.
 * The rules' optional Literacy and Projection, and Fly, which a character has
 * only with wings or a power, are not on the sheet; a player adds any of them
 * as a skill of their own (open d100 rules, p. 31, New Skills).
 */
export const HORROR_D100_FIXED_SKILLS = {
  appraise: { name: 'Appraise', base: 15 },
  bargain: { name: 'Bargain', base: 5 },
  brawl: { name: 'Brawl', base: 25 },
  climb: { name: 'Climb', base: 40 },
  command: { name: 'Command', base: 5 },
  demolition: { name: 'Demolition', base: 1 },
  disguise: { name: 'Disguise', base: 1 },
  dodge: { name: 'Dodge', base: 'DEX×2' }, // open d100 rules, p. 37, Dodge
  fastTalk: { name: 'Fast Talk', base: 5 },
  fineManipulation: { name: 'Fine Manipulation', base: 5 }, // open d100 rules, p. 39, Fine Manipulation
  firstAid: { name: 'First Aid', base: 30 },
  gaming: { name: 'Gaming', base: 'INT+POW' },
  grapple: { name: 'Grapple', base: 25 },
  hide: { name: 'Hide', base: 10 },
  insight: { name: 'Insight', base: 5 }, // open d100 rules, p. 42, Insight
  jump: { name: 'Jump', base: 25 },
  listen: { name: 'Listen', base: 25 },
  martialArts: { name: 'Martial Arts', base: 1 },
  medicine: { name: 'Medicine', base: 5 },
  navigate: { name: 'Navigate', base: 10 },
  perform: { name: 'Perform', base: 5 },
  persuade: { name: 'Persuade', base: 15 }, // open d100 rules, p. 47, Persuade
  // 0 where the setting has no such treatment (open d100 rules, pp. 48-49, Psychotherapy).
  psychotherapy: { name: 'Psychotherapy', base: 1 },
  research: { name: 'Research', base: 25 },
  sense: { name: 'Sense', base: 10 },
  sleightOfHand: { name: 'Sleight of Hand', base: 5 },
  spot: { name: 'Spot', base: 25 },
  // Not raised by experience (open d100 rules, p. 51, Status).
  status: { name: 'Status', base: 15 },
  stealth: { name: 'Stealth', base: 10 },
  strategy: { name: 'Strategy', base: 1 },
  swim: { name: 'Swim', base: 25 },
  teach: { name: 'Teach', base: 10 },
  throw: { name: 'Throw', base: 25 },
  track: { name: 'Track', base: 10 },
} as const;

/** A skill with one rating, by the key the sheet stores it under. */
export type HorrorD100FixedSkillKey = keyof typeof HORROR_D100_FIXED_SKILLS;

/**
 * The open d100 rules' skills that a character holds once for each
 * specialty, by the key the sheet stores each list under, with the base
 * chance of a new specialty (open d100 rules, pp. 33-34, Alphabetical Skill
 * List); null where each weapon or shield has its own.
 */
export const HORROR_D100_SPECIALISED_SKILLS = {
  art: { name: 'Art', base: 5 }, // open d100 rules, p. 35, Art
  artillery: { name: 'Artillery', base: null },
  craft: { name: 'Craft', base: 5 }, // open d100 rules, p. 36, Craft
  // 20 for a common vehicle, 1 for an unfamiliar one (open d100 rules, pp. 37-38, Drive).
  drive: { name: 'Drive', base: 20 },
  energyWeapon: { name: 'Energy Weapon', base: null },
  etiquette: { name: 'Etiquette', base: 5 },
  firearm: { name: 'Firearm', base: null }, // open d100 rules, p. 39, Firearm
  heavyMachine: { name: 'Heavy Machine', base: 1 }, // open d100 rules, p. 41, Heavy Machine
  heavyWeapon: { name: 'Heavy Weapon', base: null },
  // 0 for a field that takes study to grasp at all (open d100 rules, pp. 42-43,
  // Knowledge), and 0 for Blasphemous Lore (p. 43, Knowledge Specialties).
  knowledge: { name: 'Knowledge', base: 5 },
  languageOther: { name: 'Language (Other)', base: 0 }, // open d100 rules, p. 44, Language
  meleeWeapon: { name: 'Melee Weapon', base: null }, // open d100 rules, p. 46, Melee Weapon
  missileWeapon: { name: 'Missile Weapon', base: null }, // open d100 rules, p. 46, Missile Weapon
  parry: { name: 'Parry', base: null },
  pilot: { name: 'Pilot', base: 1 }, // open d100 rules, p. 48, Pilot
  repair: { name: 'Repair', base: 15 }, // open d100 rules, p. 49, Repair
  ride: { name: 'Ride', base: 5 },
  science: { name: 'Science', base: 1 }, // open d100 rules, p. 49, Science
  shield: { name: 'Shield', base: null },
  technicalSkill: { name: 'Technical Skill', base: 5 },
} as const;

/** A skill held once for each specialty, by the key the sheet stores its list under. */
export type HorrorD100SpecialisedSkillKey = keyof typeof HORROR_D100_SPECIALISED_SKILLS;

/**
 * The base chance of a skill with one rating, for the character's
 * characteristics: twice DEX for Dodge (open d100 rules, p. 37, Dodge), INT plus POW for
 * Gaming (p. 33, Alphabetical Skill List), and the list's number for the
 * rest.
 */
export function horrorD100FixedSkillBase(
  key: HorrorD100FixedSkillKey,
  characteristics: { DEX?: number; INT?: number; POW?: number }
): number {
  const { base } = HORROR_D100_FIXED_SKILLS[key];
  if (base === 'DEX×2') return characteristicOrZero(characteristics.DEX) * 2;
  if (base === 'INT+POW') return characteristicOrZero(characteristics.INT) + characteristicOrZero(characteristics.POW);
  return base;
}

/**
 * The base chance of the character's own language: five times INT, or five
 * times EDU where the sheet uses EDU and that is higher (open d100 rules, p. 44,
 * Language).
 */
export function horrorD100LanguageOwnBase(int: number, edu?: number): number {
  const fromInt = characteristicOrZero(int) * 5;
  return edu === undefined ? fromInt : Math.max(fromInt, characteristicOrZero(edu) * 5);
}

/** A skill's rating and experience check, as the sheet stores them, with any notes. */
export interface HorrorD100SkillRating {
  value: number;
  experienceCheck: boolean;
  notes?: string;
}

/** The skills block as the sheet stores it: every skill of the rules' list. */
export type HorrorD100SkillsBlock = Record<HorrorD100FixedSkillKey, HorrorD100SkillRating> &
  Record<HorrorD100SpecialisedSkillKey, (HorrorD100SkillRating & { specialty: string })[]> & {
    languageOwn: HorrorD100SkillRating & { language: string };
    own: (HorrorD100SkillRating & { name: string })[];
  };

/** One value for each of `keys`. `Object.fromEntries` forgets which keys it was given. */
function forEachKey<K extends string, V>(keys: K[], value: (key: K) => V): Record<K, V> {
  return Object.fromEntries(keys.map((key) => [key, value(key)])) as Record<K, V>;
}

/**
 * A new character's skills block: every skill with one rating at its base
 * chance, the own language at its base with no name yet, and no specialties
 * and no skills of the character's own.
 */
export function horrorD100NewSkills(characteristics: { DEX?: number; INT?: number; POW?: number; EDU?: number }): HorrorD100SkillsBlock {
  return {
    ...forEachKey(Object.keys(HORROR_D100_FIXED_SKILLS) as HorrorD100FixedSkillKey[], (key) => ({
      value: horrorD100FixedSkillBase(key, characteristics),
      experienceCheck: false,
    })),
    ...forEachKey(Object.keys(HORROR_D100_SPECIALISED_SKILLS) as HorrorD100SpecialisedSkillKey[], (): (HorrorD100SkillRating & { specialty: string })[] => []),
    languageOwn: {
      language: '',
      value: horrorD100LanguageOwnBase(characteristicOrZero(characteristics.INT), characteristics.EDU),
      experienceCheck: false,
    },
    own: [],
  };
}

/**
 * The rating of the skill a weapon names, on the rebuilt sheet. The name may
 * be the open d100 rules' ("Brawl", "Firearm (Handgun)", "Melee Weapon
 * (Sword)", "Knowledge (Occult)", "Language (Own)"), the one the sheet used
 * before it was rebuilt ("Fighting (Brawl)", "Firearms (Handgun)", "Handgun",
 * "Fighting (Sword)"), a weapon's specialty alone ("Sword"), or the whole
 * name of a skill of the character's own ("Charm"). Rifle/Shotgun, one skill
 * before the sheet was rebuilt, reads the higher of Firearm (Rifle) and
 * Firearm (Shotgun). The weapon keeps a copy of the rating, which goes stale
 * as the skill rises; that copy is used only where the sheet has no such
 * skill.
 */
export function horrorD100WeaponSkillRating(skills: unknown, skillName: string, stored: number): number {
  const all = isRecord(skills) ? skills : {};
  const name = skillName.trim().toLowerCase();
  if (!name) return stored;
  const squeezed = (text: string) => text.replace(/\s+/g, '').toLowerCase();
  const entries = (key: string): unknown[] => {
    const list = all[key];
    return Array.isArray(list) ? list : [];
  };
  const specialty = (key: string, wanted: string): number | null =>
    ratingOf(entries(key).find((entry) => isRecord(entry) && typeof entry.specialty === 'string' && entry.specialty.trim().toLowerCase() === wanted));
  const higher = (...ratings: (number | null)[]): number | null => {
    const found = ratings.filter((rating): rating is number => rating !== null);
    return found.length > 0 ? Math.max(...found) : null;
  };
  const firearm = (wanted: string): number | null =>
    wanted === 'rifle/shotgun' || wanted === 'rifle or shotgun'
      ? higher(specialty('firearm', 'rifle'), specialty('firearm', 'shotgun'))
      : specialty('firearm', wanted);

  const parts = /^(.+?)\s*\((.+)\)$/.exec(name);
  let found: number | null;
  if (!parts) {
    const key = Object.keys(HORROR_D100_FIXED_SKILLS).find((candidate) => candidate.toLowerCase() === squeezed(name));
    found = key ? ratingOf(all[key]) : firearm(name);
  } else {
    const group = squeezed(parts[1]);
    const wanted = parts[2].trim();
    if (group === 'fighting') {
      found = wanted === 'brawl' ? ratingOf(all.brawl) : specialty('meleeWeapon', wanted);
    } else if (group === 'firearm' || group === 'firearms') {
      found = firearm(wanted);
    } else if (group === 'language') {
      found = wanted === 'own' ? ratingOf(all.languageOwn) : specialty('languageOther', wanted);
    } else {
      const key = Object.entries(HORROR_D100_SPECIALISED_SKILLS)
        .find(([candidate, skill]) => candidate.toLowerCase() === group || squeezed(skill.name) === group)?.[0];
      found = key ? specialty(key, wanted) : null;
    }
  }
  if (found !== null) return found;
  const own = ratingOf(entries('own').find((entry) => isRecord(entry) && typeof entry.name === 'string' && entry.name.trim().toLowerCase() === name));
  if (own !== null) return own;
  if (!parts) {
    for (const key of ['meleeWeapon', 'missileWeapon', 'firearm', 'heavyWeapon', 'energyWeapon', 'artillery', 'shield']) {
      const alone = specialty(key, name);
      if (alone !== null) return alone;
    }
  }
  return stored;
}
