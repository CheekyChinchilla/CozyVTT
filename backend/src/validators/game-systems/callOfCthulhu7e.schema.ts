/**
 * Call of Cthulhu 7e Zod Validation Schema
 * Runtime validation for Call of Cthulhu 7e character data
 */

import { z } from 'zod';
import { themeColorSchema } from './sheetChrome';
import {
  sheetCharacterNameSchema,
  sheetShortTextSchema as shortText,
  sheetLongTextSchema as longText,
} from './sheetText';
import { sheetList } from './sheetLists';

/**
 * Characteristic
 */
const characteristicSchema = z.object({
  regular: z.number().int().min(0).max(100),
  half: z.number().int().min(0).max(50),
  fifth: z.number().int().min(0).max(20),
});

/**
 * All characteristics
 */
const characteristicsSchema = z.object({
  STR: characteristicSchema,
  CON: characteristicSchema,
  SIZ: characteristicSchema,
  DEX: characteristicSchema,
  APP: characteristicSchema,
  INT: characteristicSchema,
  POW: characteristicSchema,
  EDU: characteristicSchema,
});

/**
 * Hit points
 */
const hitPointsSchema = z.object({
  maximum: z.number().int().min(1),
  current: z.number().int(),
  formula: shortText,
  majorWoundThreshold: z.number().int().min(1),
});

/**
 * Sanity
 */
const sanitySchema = z.object({
  starting: z.number().int().min(0).max(99),
  maximum: z.number().int().min(0).max(99),
  current: z.number().int().min(0).max(99),
  formula: shortText,
});

/**
 * Magic points
 */
const magicPointsSchema = z.object({
  maximum: z.number().int().min(0),
  current: z.number().int().min(0),
  formula: shortText,
});

/**
 * Luck
 * Notes optional
 */
const luckSchema = z.object({
  score: z.number().int().min(0).max(99),
  notes: longText.optional(),
});

/**
 * Dodge
 */
const dodgeSchema = z.object({
  value: z.number().int().min(0).max(100),
  formula: shortText,
  improvementChecked: z.boolean(),
});

/**
 * Derived stats
 */
const derivedStatsSchema = z.object({
  hp: hitPointsSchema,
  sanity: sanitySchema,
  magicPoints: magicPointsSchema,
  luck: luckSchema,
  damageBonus: shortText,
  build: z.number().int(),
  moveRate: z.number().int().min(0),
  dodge: dodgeSchema,
});

/**
 * Skill
 */
const skillSchema = z.object({
  baseValue: z.number().int().min(0).max(100),
  currentValue: z.number().int().min(0).max(100),
  improvementChecked: z.boolean(),
  specialization: shortText.nullable().optional(),
  notes: longText.optional(),
});

/**
 * Fighting skill. A specialisation the player adds (Sword, Axe) carries its
 * name; Brawl has none.
 */
const fightingSkillSchema = z.object({
  baseValue: z.number().int().min(0).max(100),
  currentValue: z.number().int().min(0).max(100),
  improvementChecked: z.boolean(),
  specialization: shortText.optional(),
});

/**
 * Fighting skills
 */
const fightingSkillsSchema = z.object({
  brawl: fightingSkillSchema,
  custom: sheetList(fightingSkillSchema),
});

/**
 * Firearms skill. A specialisation the player adds (Bow, Submachine Gun)
 * carries its name; the three printed on the sheet have none.
 */
const firearmsSkillSchema = z.object({
  baseValue: z.number().int().min(0).max(100),
  currentValue: z.number().int().min(0).max(100),
  improvementChecked: z.boolean(),
  specialization: shortText.optional(),
});

/**
 * Firearms skills
 */
const firearmsSkillsSchema = z.object({
  handgun: firearmsSkillSchema,
  rifle: firearmsSkillSchema,
  shotgun: firearmsSkillSchema,
  custom: sheetList(firearmsSkillSchema),
});

/**
 * Language skill. The name may be empty, as the sheet's other name boxes may:
 * clearing one to retype it writes an empty string.
 */
const languageSkillSchema = z.object({
  language: shortText,
  baseValue: z.number().int().min(0).max(100),
  currentValue: z.number().int().min(0).max(100),
  improvementChecked: z.boolean(),
});

/**
 * Science skill. The specialisation may be empty, as a language's name may.
 */
const scienceSkillSchema = z.object({
  specialization: shortText,
  baseValue: z.number().int().min(0).max(100),
  currentValue: z.number().int().min(0).max(100),
  improvementChecked: z.boolean(),
});

/**
 * All skills
 */
const skillsSchema = z.object({
  accounting: skillSchema,
  anthropology: skillSchema,
  appraise: skillSchema,
  archaeology: skillSchema,
  artCraft: skillSchema,
  charm: skillSchema,
  climb: skillSchema,
  creditRating: skillSchema,
  cthulhuMythos: skillSchema,
  disguise: skillSchema,
  dodge: skillSchema,
  driveAuto: skillSchema,
  electricalRepair: skillSchema,
  fastTalk: skillSchema,
  fighting: fightingSkillsSchema,
  firearms: firearmsSkillsSchema,
  firstAid: skillSchema,
  history: skillSchema,
  intimidate: skillSchema,
  jump: skillSchema,
  languageOwn: skillSchema.extend({ language: shortText }),
  languageOther: sheetList(languageSkillSchema),
  law: skillSchema,
  libraryUse: skillSchema,
  listen: skillSchema,
  locksmith: skillSchema,
  mechanicalRepair: skillSchema,
  medicine: skillSchema,
  naturalWorld: skillSchema,
  navigate: skillSchema,
  occult: skillSchema,
  operateHeavyMachinery: skillSchema,
  persuade: skillSchema,
  pilot: skillSchema,
  psychoanalysis: skillSchema,
  psychology: skillSchema,
  ride: skillSchema,
  science: sheetList(scienceSkillSchema),
  sleightOfHand: skillSchema,
  spotHidden: skillSchema,
  stealth: skillSchema,
  survival: skillSchema,
  swim: skillSchema,
  throw: skillSchema,
  track: skillSchema,
  // A custom skill is named by the player, and the sheet and the roll list
  // show that name.
  customSkills: sheetList(skillSchema.extend({ name: shortText.optional() })),
});

/**
 * Weapon
 * Most fields optional for quick weapon addition
 */
const weaponSchema = z.object({
  name: shortText.min(1),
  // A text box on the sheet; empty when cleared.
  skill: shortText.optional(),
  skillValue: z.number().int().min(0).max(100).optional(),
  damage: shortText.optional(),
  range: shortText.optional(),
  attacks: z.number().int().min(1).optional(),
  ammo: z.number().int().min(0).nullable().optional(),
  malfunction: z.number().int().min(0).max(100).nullable().optional(),
  notes: longText.optional(),
});

/**
 * Combat
 */
const combatSchema = z.object({
  weapons: sheetList(weaponSchema),
});

/**
 * Conditions
 */
const conditionsSchema = z.object({
  unconscious: z.boolean().optional(),
  dying: z.boolean().optional(),
  majorWound: z.boolean().optional(),
  temporaryInsanity: z.boolean().optional(),
  indefiniteInsanity: z.boolean().optional(),
});

/**
 * Spells and mythos
 */
const spellsAndMythosSchema = z.object({
  cthulhuMythos: z.number().int().min(0).max(100),
  spells: sheetList(shortText),
});

/**
 * Possession
 * Notes optional
 */
const possessionSchema = z.object({
  name: shortText.min(1),
  notes: longText.optional(),
});

/**
 * Wealth
 * All fields optional for progressive wealth tracking
 */
const wealthSchema = z.object({
  spendingLevel: shortText.optional(),
  cash: z.number().min(0).optional(),
  assets: longText.optional(),
  notes: longText.optional(),
});

/**
 * Backstory
 * All fields optional to allow progressive character development
 */
const backstorySchema = z.object({
  description: longText.optional(),
  personalDescription: longText.optional(),
  ideology: longText.optional(),
  significantPeople: longText.optional(),
  meaningfulLocations: longText.optional(),
  treasuredPossessions: longText.optional(),
  traits: longText.optional(),
  injuriesAndScars: longText.optional(),
  phobiasAndManias: longText.optional(),
  arcaneTomesAndSpells: longText.optional(),
  encountersWithStrangeEntities: longText.optional(),
});

/**
 * Contact
 * Role and notes optional for quick contact addition
 */
const contactSchema = z.object({
  name: shortText.min(1),
  role: shortText.min(1).optional(),
  notes: longText.optional(),
});

/**
 * Appearance
 */
const appearanceSchema = z.object({
  age: z.union([shortText, z.number()]).transform(v => String(v)).optional(),
  height: shortText.optional(),
  weight: shortText.optional(),
  eyes: shortText.optional(),
  hair: shortText.optional(),
  skin: shortText.optional(),
});

/**
 * Complete Call of Cthulhu 7e character data schema
 * Most fields are optional to support partial saves and incremental character building.
 *
 * REQUIRED fields (core identity & mechanics):
 * - investigatorName, occupation, era, characteristics
 *
 * OPTIONAL fields (everything else):
 * - All other fields can be omitted and added progressively
 */
export const callOfCthulhu7eCharacterDataSchema = z.object({
  themeColor: themeColorSchema,
  // Required: Core identity
  investigatorName: sheetCharacterNameSchema,
  occupation: shortText.min(1),
  era: shortText.min(1),
  characteristics: characteristicsSchema,

  // Optional: Additional details
  playerName: shortText.min(1).optional(),
  age: z.union([shortText, z.number()]).transform(v => String(v)).optional(),
  // Empty is allowed: these are text boxes on the sheet, and clearing one
  // writes an empty string, which `min(1)` refused along with the whole save.
  sex: shortText.optional(),
  residence: shortText.optional(),
  birthplace: shortText.optional(),
  derivedStats: derivedStatsSchema.optional(),
  skills: skillsSchema.optional(),
  combat: combatSchema.optional(),
  conditions: conditionsSchema.optional(),
  pulpTalents: sheetList(shortText).optional(),
  spellsAndMythos: spellsAndMythosSchema.optional(),
  possessions: sheetList(possessionSchema).optional(),
  wealth: wealthSchema.optional(),
  backstory: backstorySchema.optional(),
  contacts: sheetList(contactSchema).optional(),
  appearance: appearanceSchema.optional(),
  notes: longText.optional(),
});

/**
 * Type inference from schema
 */
export type CoC7eCharacterData = z.infer<typeof callOfCthulhu7eCharacterDataSchema>;
