/**
 * Call of Cthulhu 7e Zod Validation Schema
 * Runtime validation for Call of Cthulhu 7e character data
 */

import { z } from 'zod';

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
  formula: z.string(),
  majorWoundThreshold: z.number().int().min(1),
});

/**
 * Sanity
 */
const sanitySchema = z.object({
  starting: z.number().int().min(0).max(99),
  maximum: z.number().int().min(0).max(99),
  current: z.number().int().min(0).max(99),
  formula: z.string(),
});

/**
 * Magic points
 */
const magicPointsSchema = z.object({
  maximum: z.number().int().min(0),
  current: z.number().int().min(0),
  formula: z.string(),
});

/**
 * Luck
 * Notes optional
 */
const luckSchema = z.object({
  score: z.number().int().min(0).max(99),
  notes: z.string().optional(),
});

/**
 * Dodge
 */
const dodgeSchema = z.object({
  value: z.number().int().min(0).max(100),
  formula: z.string(),
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
  damageBonus: z.string(),
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
  specialization: z.string().nullable().optional(),
  notes: z.string().optional(),
});

/**
 * Fighting skill
 */
const fightingSkillSchema = z.object({
  baseValue: z.number().int().min(0).max(100),
  currentValue: z.number().int().min(0).max(100),
  improvementChecked: z.boolean(),
});

/**
 * Fighting skills
 */
const fightingSkillsSchema = z.object({
  brawl: fightingSkillSchema,
  custom: z.array(fightingSkillSchema),
});

/**
 * Firearms skill
 */
const firearmsSkillSchema = z.object({
  baseValue: z.number().int().min(0).max(100),
  currentValue: z.number().int().min(0).max(100),
  improvementChecked: z.boolean(),
});

/**
 * Firearms skills
 */
const firearmsSkillsSchema = z.object({
  handgun: firearmsSkillSchema,
  rifle: firearmsSkillSchema,
  shotgun: firearmsSkillSchema,
  custom: z.array(firearmsSkillSchema),
});

/**
 * Language skill
 */
const languageSkillSchema = z.object({
  language: z.string().min(1),
  baseValue: z.number().int().min(0).max(100),
  currentValue: z.number().int().min(0).max(100),
  improvementChecked: z.boolean(),
});

/**
 * Science skill
 */
const scienceSkillSchema = z.object({
  specialization: z.string().min(1),
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
  languageOwn: skillSchema.extend({ language: z.string().min(1) }),
  languageOther: z.array(languageSkillSchema),
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
  science: z.array(scienceSkillSchema),
  sleightOfHand: skillSchema,
  spotHidden: skillSchema,
  stealth: skillSchema,
  survival: skillSchema,
  swim: skillSchema,
  throw: skillSchema,
  track: skillSchema,
  customSkills: z.array(skillSchema),
});

/**
 * Weapon
 * Most fields optional for quick weapon addition
 */
const weaponSchema = z.object({
  name: z.string().min(1),
  skill: z.string().min(1).optional(),
  skillValue: z.number().int().min(0).max(100).optional(),
  damage: z.string().optional(),
  range: z.string().optional(),
  attacks: z.number().int().min(1).optional(),
  ammo: z.number().int().min(0).nullable().optional(),
  malfunction: z.number().int().min(0).max(100).nullable().optional(),
  notes: z.string().optional(),
});

/**
 * Combat
 */
const combatSchema = z.object({
  weapons: z.array(weaponSchema),
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
  spells: z.array(z.string()),
});

/**
 * Possession
 * Notes optional
 */
const possessionSchema = z.object({
  name: z.string().min(1),
  notes: z.string().optional(),
});

/**
 * Wealth
 * All fields optional for progressive wealth tracking
 */
const wealthSchema = z.object({
  spendingLevel: z.string().optional(),
  cash: z.number().min(0).optional(),
  assets: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Backstory
 * All fields optional to allow progressive character development
 */
const backstorySchema = z.object({
  description: z.string().optional(),
  personalDescription: z.string().optional(),
  ideology: z.string().optional(),
  significantPeople: z.string().optional(),
  meaningfulLocations: z.string().optional(),
  treasuredPossessions: z.string().optional(),
  traits: z.string().optional(),
  injuriesAndScars: z.string().optional(),
  phobiasAndManias: z.string().optional(),
  arcaneTomesAndSpells: z.string().optional(),
  encountersWithStrangeEntities: z.string().optional(),
});

/**
 * Contact
 * Role and notes optional for quick contact addition
 */
const contactSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1).optional(),
  notes: z.string().optional(),
});

/**
 * Appearance
 */
const appearanceSchema = z.object({
  age: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
  height: z.string().optional(),
  weight: z.string().optional(),
  eyes: z.string().optional(),
  hair: z.string().optional(),
  skin: z.string().optional(),
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
  // Required: Core identity
  investigatorName: z.string().min(1),
  occupation: z.string().min(1),
  era: z.string().min(1),
  characteristics: characteristicsSchema,

  // Optional: Additional details
  playerName: z.string().min(1).optional(),
  age: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
  sex: z.string().min(1).optional(),
  residence: z.string().min(1).optional(),
  birthplace: z.string().min(1).optional(),
  derivedStats: derivedStatsSchema.optional(),
  skills: skillsSchema.optional(),
  combat: combatSchema.optional(),
  conditions: conditionsSchema.optional(),
  pulpTalents: z.array(z.string()).optional(),
  spellsAndMythos: spellsAndMythosSchema.optional(),
  possessions: z.array(possessionSchema).optional(),
  wealth: wealthSchema.optional(),
  backstory: backstorySchema.optional(),
  contacts: z.array(contactSchema).optional(),
  appearance: appearanceSchema.optional(),
  notes: z.string().optional(),
});

/**
 * Type inference from schema
 */
export type CoC7eCharacterData = z.infer<typeof callOfCthulhu7eCharacterDataSchema>;
