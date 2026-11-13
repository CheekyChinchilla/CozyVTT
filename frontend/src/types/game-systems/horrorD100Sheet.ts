// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * The Horror d100 sheet, rebuilt on the open d100 rules (Frontend)
 *
 * The shape the backend's schema accepts (backend/src/validators/game-systems/
 * horrorD100Sheet.schema.ts), which decides what is stored. A field the schema
 * lets be absent is optional here, since the server sends a sheet as it was
 * stored. backend/src/__tests__/keepInStep.test.ts fails when the two disagree.
 */

import type { SheetChrome } from './sheetChrome';

/** The seven characteristics, and EDU where the sheet uses it. */
export interface HorrorD100SheetCharacteristics {
  STR: number;
  CON: number;
  SIZ: number;
  INT: number;
  POW: number;
  DEX: number;
  CHA: number;
  EDU?: number;
}

/** Hit points; the current number can go below 0. */
export interface HorrorD100SheetHitPoints {
  maximum: number;
  current: number;
}

/** Power points. */
export interface HorrorD100SheetPowerPoints {
  maximum: number;
  current: number;
}

/** Sanity. */
export interface HorrorD100SheetSanity {
  starting: number;
  maximum: number;
  current: number;
}

/** A skill with one rating, and its experience check. */
export interface HorrorD100SheetSkill {
  value: number;
  experienceCheck: boolean;
  notes?: string;
}

/** One specialty of a skill held once for each, such as Knowledge (Occult). */
export interface HorrorD100SheetSpecialty extends HorrorD100SheetSkill {
  specialty: string;
}

/** The character's own language. */
export interface HorrorD100SheetLanguageOwn extends HorrorD100SheetSkill {
  language: string;
}

/** A skill of the character's own. */
export interface HorrorD100SheetOwnSkill extends HorrorD100SheetSkill {
  name: string;
}

/** The skills block: every skill of the rules' list. */
export interface HorrorD100SheetSkills {
  appraise: HorrorD100SheetSkill;
  bargain: HorrorD100SheetSkill;
  brawl: HorrorD100SheetSkill;
  climb: HorrorD100SheetSkill;
  command: HorrorD100SheetSkill;
  demolition: HorrorD100SheetSkill;
  disguise: HorrorD100SheetSkill;
  dodge: HorrorD100SheetSkill;
  fastTalk: HorrorD100SheetSkill;
  fineManipulation: HorrorD100SheetSkill;
  firstAid: HorrorD100SheetSkill;
  gaming: HorrorD100SheetSkill;
  grapple: HorrorD100SheetSkill;
  hide: HorrorD100SheetSkill;
  insight: HorrorD100SheetSkill;
  jump: HorrorD100SheetSkill;
  listen: HorrorD100SheetSkill;
  martialArts: HorrorD100SheetSkill;
  medicine: HorrorD100SheetSkill;
  navigate: HorrorD100SheetSkill;
  perform: HorrorD100SheetSkill;
  persuade: HorrorD100SheetSkill;
  psychotherapy: HorrorD100SheetSkill;
  research: HorrorD100SheetSkill;
  sense: HorrorD100SheetSkill;
  sleightOfHand: HorrorD100SheetSkill;
  spot: HorrorD100SheetSkill;
  status: HorrorD100SheetSkill;
  stealth: HorrorD100SheetSkill;
  strategy: HorrorD100SheetSkill;
  swim: HorrorD100SheetSkill;
  teach: HorrorD100SheetSkill;
  throw: HorrorD100SheetSkill;
  track: HorrorD100SheetSkill;
  languageOwn: HorrorD100SheetLanguageOwn;
  art: HorrorD100SheetSpecialty[];
  artillery: HorrorD100SheetSpecialty[];
  craft: HorrorD100SheetSpecialty[];
  drive: HorrorD100SheetSpecialty[];
  energyWeapon: HorrorD100SheetSpecialty[];
  etiquette: HorrorD100SheetSpecialty[];
  firearm: HorrorD100SheetSpecialty[];
  heavyMachine: HorrorD100SheetSpecialty[];
  heavyWeapon: HorrorD100SheetSpecialty[];
  knowledge: HorrorD100SheetSpecialty[];
  languageOther: HorrorD100SheetSpecialty[];
  meleeWeapon: HorrorD100SheetSpecialty[];
  missileWeapon: HorrorD100SheetSpecialty[];
  parry: HorrorD100SheetSpecialty[];
  pilot: HorrorD100SheetSpecialty[];
  repair: HorrorD100SheetSpecialty[];
  ride: HorrorD100SheetSpecialty[];
  science: HorrorD100SheetSpecialty[];
  shield: HorrorD100SheetSpecialty[];
  technicalSkill: HorrorD100SheetSpecialty[];
  own: HorrorD100SheetOwnSkill[];
}

/** A weapon, kept as the player typed it. */
export interface HorrorD100SheetWeapon {
  name: string;
  skill?: string;
  skillValue?: number;
  damage?: string;
  range?: string;
  attacks?: number;
  ammo?: number | null;
  malfunction?: number | null;
  notes?: string;
}

/** A piece of armour. */
export interface HorrorD100SheetArmor {
  name: string;
  armorValue?: number;
  notes?: string;
}

/** The conditions a player ticks. */
export interface HorrorD100SheetConditions {
  unconscious?: boolean;
  dying?: boolean;
  majorWound?: boolean;
  temporaryInsanity?: boolean;
}

/** A possession. */
export interface HorrorD100SheetPossession {
  name: string;
  notes?: string;
}

/** Wealth. */
export interface HorrorD100SheetWealth {
  level?: string;
  cash?: number;
  assets?: string;
  notes?: string;
}

/** A titled note about the character's story. */
export interface HorrorD100SheetStoryNote {
  title: string;
  text: string;
}

/** A contact. */
export interface HorrorD100SheetContact {
  name: string;
  role?: string;
  notes?: string;
}

/** Appearance. */
export interface HorrorD100SheetAppearance {
  age?: string | number;
  height?: string;
  weight?: string;
  eyes?: string;
  hair?: string;
  skin?: string;
}

/**
 * The record of a sheet's conversion from the shape before 1.7.0: the old
 * sheet's values under CozyVTT's names, and what the conversion could not
 * place. Read-only; shown to the sheet's owner and the GM.
 */
export interface HorrorD100ConversionRecord {
  from: 1;
  at: string;
  characteristics: {
    STR?: number;
    CON?: number;
    SIZ?: number;
    INT?: number;
    POW?: number;
    DEX?: number;
    CHA?: number;
    EDU?: number;
  };
  luck?: number;
  hitPoints?: { maximum?: number; current?: number };
  powerPoints?: { maximum?: number; current?: number };
  sanity?: { starting?: number; maximum?: number; current?: number };
  damageModifier?: string;
  build?: number;
  move?: number;
  /** Each old skill's rating; an experience check only where the rebuilt sheet has no place for it. */
  skills: { name: string; value: number; experienceCheck?: boolean }[];
  kept: string[];
}

/**
 * The rebuilt Horror d100 sheet.
 *
 * REQUIRED: characterName, profession, era, characteristics. Everything else
 * is added as the character grows.
 */
export interface HorrorD100Sheet extends SheetChrome {
  characterName: string;
  profession: string;
  era: string;
  characteristics: HorrorD100SheetCharacteristics;

  playerName?: string;
  age?: string | number;
  sex?: string;
  residence?: string;
  birthplace?: string;
  hitPoints?: HorrorD100SheetHitPoints;
  powerPoints?: HorrorD100SheetPowerPoints;
  sanity?: HorrorD100SheetSanity;
  move?: number;
  skills?: HorrorD100SheetSkills;
  weapons?: HorrorD100SheetWeapon[];
  armor?: HorrorD100SheetArmor[];
  conditions?: HorrorD100SheetConditions;
  distinctiveFeatures?: string[];
  spells?: string[];
  possessions?: HorrorD100SheetPossession[];
  wealth?: HorrorD100SheetWealth;
  story?: HorrorD100SheetStoryNote[];
  contacts?: HorrorD100SheetContact[];
  appearance?: HorrorD100SheetAppearance;
  /** The GM's notes, sent to the GM alone. */
  notes?: string;
  converted?: HorrorD100ConversionRecord;
}
