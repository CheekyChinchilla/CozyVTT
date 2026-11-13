// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * The Horror d100 sheet, rebuilt on the open d100 rules.
 *
 * Its characteristics are the rules' seven, on their scale, with EDU where
 * the sheet uses it. Its skills are the rules' list (utils/rules/horrorD100.ts
 * names each with its base chance): one rating each for most, a list of
 * specialties for the rest, the character's own language, and skills of the
 * character's own. A rating is whatever the player wrote, from 0 up, below the
 * skill's base too. Hit points, power points, Sanity and MOV are stored, since
 * the GM may change them; the damage modifier, the major wound level and the
 * experience bonus are worked out from the characteristics wherever they are
 * shown.
 *
 * A sheet converted from the shape versions before 1.7.0 stored carries the
 * record of that conversion, `converted`: the old sheet's values, numbers and
 * short labels under CozyVTT's names, and anything the conversion could not
 * place. The sheet shows it to the character's owner and the GM; it holds
 * only values every reader of the old sheet was already sent, never the GM's
 * notes. It is kept as it was written.
 *
 * As with every sheet, a key this schema does not declare is dropped when the
 * sheet is saved, and `notes` is the GM's alone (utils/gmNotes.ts).
 */

import { z } from 'zod';
import { themeColorSchema } from './sheetChrome';
import {
  sheetCharacterNameSchema,
  sheetShortTextSchema as shortText,
  sheetLongTextSchema as longText,
} from './sheetText';
import { sheetList } from './sheetLists';
import { HORROR_D100_FIREARM_LIST_MAX, HORROR_D100_OWN_SKILL_LIST_MAX, HORROR_D100_VALUE_MAX, SHEET_NAME_MAX } from './sheetLimits';

/** A characteristic, a skill's rating, MOV or an armour value. */
const rating = z.number().int().min(0).max(HORROR_D100_VALUE_MAX);

/** A heading the player can rename: a story note's title. */
const heading = z.string().max(SHEET_NAME_MAX, `Can be at most ${SHEET_NAME_MAX} characters`);

/** The seven characteristics, and EDU where the sheet uses it. */
const characteristicsSchema = z.object({
  STR: rating,
  CON: rating,
  SIZ: rating,
  INT: rating,
  POW: rating,
  DEX: rating,
  CHA: rating,
  EDU: rating.optional(),
});

/** Hit points: the current number can go below 0, which the rules track. */
const hitPointsSchema = z.object({
  maximum: z.number().int().min(0),
  current: z.number().int(),
});

/** Power points: never below 0. */
const powerPointsSchema = z.object({
  maximum: z.number().int().min(0),
  current: z.number().int().min(0),
});

/** Sanity, never above 99. */
const sanitySchema = z.object({
  starting: z.number().int().min(0).max(99),
  maximum: z.number().int().min(0).max(99),
  current: z.number().int().min(0).max(99),
});

/** A skill with one rating, and its experience check. */
const skillSchema = z.object({
  value: rating,
  experienceCheck: z.boolean(),
  notes: longText.optional(),
});

/** One specialty of a skill held once for each, such as Knowledge (Occult). The specialty may be empty while it is typed. */
const specialtySchema = skillSchema.extend({ specialty: shortText });

/** The character's own language, by its name. */
const languageOwnSchema = skillSchema.extend({ language: shortText });

/** A skill of the character's own, by the name the player gave it. */
const ownSkillSchema = skillSchema.extend({ name: shortText });

/**
 * The skills block: every skill of the rules' list, or none. The rules list
 * the same skills with their base chances, and keepInStep.test.ts fails when
 * the two differ.
 */
const skillsSchema = z.object({
  appraise: skillSchema,
  bargain: skillSchema,
  brawl: skillSchema,
  climb: skillSchema,
  command: skillSchema,
  demolition: skillSchema,
  disguise: skillSchema,
  dodge: skillSchema,
  fastTalk: skillSchema,
  fineManipulation: skillSchema,
  firstAid: skillSchema,
  gaming: skillSchema,
  grapple: skillSchema,
  hide: skillSchema,
  insight: skillSchema,
  jump: skillSchema,
  listen: skillSchema,
  martialArts: skillSchema,
  medicine: skillSchema,
  navigate: skillSchema,
  perform: skillSchema,
  persuade: skillSchema,
  psychotherapy: skillSchema,
  research: skillSchema,
  sense: skillSchema,
  sleightOfHand: skillSchema,
  spot: skillSchema,
  status: skillSchema,
  stealth: skillSchema,
  strategy: skillSchema,
  swim: skillSchema,
  teach: skillSchema,
  throw: skillSchema,
  track: skillSchema,
  languageOwn: languageOwnSchema,
  art: sheetList(specialtySchema),
  artillery: sheetList(specialtySchema),
  craft: sheetList(specialtySchema),
  drive: sheetList(specialtySchema),
  energyWeapon: sheetList(specialtySchema),
  etiquette: sheetList(specialtySchema),
  firearm: sheetList(specialtySchema, HORROR_D100_FIREARM_LIST_MAX),
  heavyMachine: sheetList(specialtySchema),
  heavyWeapon: sheetList(specialtySchema),
  knowledge: sheetList(specialtySchema),
  languageOther: sheetList(specialtySchema),
  meleeWeapon: sheetList(specialtySchema),
  missileWeapon: sheetList(specialtySchema),
  parry: sheetList(specialtySchema),
  pilot: sheetList(specialtySchema),
  repair: sheetList(specialtySchema),
  ride: sheetList(specialtySchema),
  science: sheetList(specialtySchema),
  shield: sheetList(specialtySchema),
  technicalSkill: sheetList(specialtySchema),
  own: sheetList(ownSkillSchema, HORROR_D100_OWN_SKILL_LIST_MAX),
});

/**
 * A weapon. Its fields are kept as the player typed them; `skillValue` is a
 * copy of the rating, which the sheet reads only where it has no such skill.
 */
const weaponSchema = z.object({
  name: shortText.min(1),
  // A text box on the sheet; empty when cleared.
  skill: shortText.optional(),
  skillValue: rating.optional(),
  damage: shortText.optional(),
  range: shortText.optional(),
  attacks: z.number().int().min(1).optional(),
  ammo: z.number().int().min(0).nullable().optional(),
  malfunction: z.number().int().min(0).max(100).nullable().optional(),
  notes: longText.optional(),
});

/** A piece of armour and its armour value. */
const armorSchema = z.object({
  name: shortText.min(1),
  armorValue: rating.optional(),
  notes: longText.optional(),
});

/** The conditions a player ticks. */
const conditionsSchema = z.object({
  unconscious: z.boolean().optional(),
  dying: z.boolean().optional(),
  majorWound: z.boolean().optional(),
  temporaryInsanity: z.boolean().optional(),
});

/** A possession. */
const possessionSchema = z.object({
  name: shortText.min(1),
  notes: longText.optional(),
});

/** Wealth: the level is free text, so a group can use the rules' five levels or its own. */
const wealthSchema = z.object({
  level: shortText.optional(),
  cash: z.number().min(0).optional(),
  assets: longText.optional(),
  notes: longText.optional(),
});

/** A titled note about the character's story. The player titles, adds and removes them. */
const storyNoteSchema = z.object({
  title: heading,
  text: longText,
});

/** A contact. The name and role may be empty while they are typed. */
const contactSchema = z.object({
  name: shortText,
  role: shortText.optional(),
  notes: longText.optional(),
});

/** Appearance. */
const appearanceSchema = z.object({
  age: z.union([shortText, z.number()]).transform(v => String(v)).optional(),
  height: shortText.optional(),
  weight: shortText.optional(),
  eyes: shortText.optional(),
  hair: shortText.optional(),
  skin: shortText.optional(),
});

/** An original value, as the old sheet held it. */
const original = z.number();

/** Text the server copied from the old sheet, which may predate today's limits. */
const copiedText = z.string();

/**
 * The record of a sheet's conversion from the shape before 1.7.0, written
 * once by the server when the sheet is converted and kept as it is. `from`
 * is the shape it came from; `skills` names each old skill as the old sheet
 * showed it, with its experience check where the rebuilt sheet keeps none;
 * `kept` lists whatever the conversion could not place, with its value, and
 * every value it kept outside today's limits.
 *
 * Nothing in it has a length or a count limit beyond the body limit every
 * save has. It is read-only and copied from an older sheet, whose text and
 * lists predate today's limits, so a limit here could stop a sheet from ever
 * being saved again. A save keeps the stored record, and only creating a
 * character takes one from a request (legacy/sheetConversion.ts).
 */
export const HorrorD100ConversionRecordSchema = z.object({
  from: z.literal(1),
  at: copiedText,
  characteristics: z.object({
    STR: original.optional(),
    CON: original.optional(),
    SIZ: original.optional(),
    INT: original.optional(),
    POW: original.optional(),
    DEX: original.optional(),
    CHA: original.optional(),
    EDU: original.optional(),
  }),
  luck: original.optional(),
  hitPoints: z.object({ maximum: original.optional(), current: original.optional() }).optional(),
  powerPoints: z.object({ maximum: original.optional(), current: original.optional() }).optional(),
  sanity: z.object({ starting: original.optional(), maximum: original.optional(), current: original.optional() }).optional(),
  damageModifier: copiedText.optional(),
  build: original.optional(),
  move: original.optional(),
  // An experience check the rebuilt sheet gives the skill no place for:
  // Status's and Blasphemous Lore's.
  skills: z.array(z.object({ name: copiedText, value: original, experienceCheck: z.boolean().optional() })),
  kept: z.array(copiedText),
});

/**
 * The rebuilt Horror d100 sheet. A name, a profession, an era and the
 * characteristics are required; everything else is added as the character
 * grows.
 */
export const HorrorD100SheetSchema = z.object({
  themeColor: themeColorSchema,
  characterName: sheetCharacterNameSchema,
  profession: shortText.min(1),
  era: shortText.min(1),
  characteristics: characteristicsSchema,

  playerName: shortText.min(1).optional(),
  age: z.union([shortText, z.number()]).transform(v => String(v)).optional(),
  // Empty is allowed: clearing a text box writes an empty string.
  sex: shortText.optional(),
  residence: shortText.optional(),
  birthplace: shortText.optional(),
  hitPoints: hitPointsSchema.optional(),
  powerPoints: powerPointsSchema.optional(),
  sanity: sanitySchema.optional(),
  move: rating.optional(),
  skills: skillsSchema.optional(),
  weapons: sheetList(weaponSchema).optional(),
  armor: sheetList(armorSchema).optional(),
  conditions: conditionsSchema.optional(),
  distinctiveFeatures: sheetList(shortText).optional(),
  spells: sheetList(shortText).optional(),
  possessions: sheetList(possessionSchema).optional(),
  wealth: wealthSchema.optional(),
  story: sheetList(storyNoteSchema).optional(),
  contacts: sheetList(contactSchema).optional(),
  appearance: appearanceSchema.optional(),
  notes: longText.optional(),
  converted: HorrorD100ConversionRecordSchema.optional(),
});

/** The rebuilt Horror d100 sheet, as the schema gives it back. */
export type HorrorD100Sheet = z.infer<typeof HorrorD100SheetSchema>;

/** The record of a sheet's conversion from the shape before 1.7.0. */
export type HorrorD100ConversionRecord = z.infer<typeof HorrorD100ConversionRecordSchema>;
