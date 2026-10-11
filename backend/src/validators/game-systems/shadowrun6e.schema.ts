/**
 * Shadowrun 6e Zod Validation Schema
 * Runtime validation for Shadowrun 6e character data
 */

import { z } from 'zod';
import { themeColorSchema } from './sheetChrome';
import {
  sheetCharacterNameSchema,
  sheetShortTextSchema as shortText,
  sheetLongTextSchema as longText,
} from './sheetText';
import { sheetList } from './sheetLists';
import { SHEET_ROW_TAGS_MAX } from './sheetLimits';

/**
 * Karma
 */
const karmaSchema = z.object({
  current: z.number().int().min(0),
  total: z.number().int().min(0),
});

/**
 * Personal data
 */
const personalDataSchema = z.object({
  age: z.union([shortText, z.number()]).transform(v => String(v)),
  sex: shortText,
  height: shortText,
  weight: shortText,
  ethnicity: shortText,
  lifestyle: shortText,
  primaryArmor: shortText,
  primaryRangedWeapon: shortText,
  primaryMeleeWeapon: shortText,
});

/**
 * Attribute
 */
const attributeSchema = z.object({
  base: z.number().int().min(1).max(12),
  augmented: z.number().int().min(1).max(12),
});

/**
 * Physical attributes
 */
const physicalAttributesSchema = z.object({
  body: attributeSchema,
  agility: attributeSchema,
  reaction: attributeSchema,
  strength: attributeSchema,
});

/**
 * Mental attributes
 */
const mentalAttributesSchema = z.object({
  willpower: attributeSchema,
  logic: attributeSchema,
  intuition: attributeSchema,
  charisma: attributeSchema,
});

/**
 * Essence
 */
const essenceSchema = z.object({
  current: z.number().min(0).max(6),
  maximum: z.number().min(0).max(6),
});

/**
 * Special attributes
 */
const specialAttributesSchema = z.object({
  edge: attributeSchema,
  essence: essenceSchema,
  magic: z.number().int().min(0).max(12).nullable(),
  resonance: z.number().int().min(0).max(12).nullable(),
});

/**
 * All attributes
 */
const attributesSchema = z.object({
  physical: physicalAttributesSchema,
  mental: mentalAttributesSchema,
  special: specialAttributesSchema,
});

/**
 * Initiative
 */
const initiativeSchema = z.object({
  base: z.number().int().nullable(),
  dicePools: shortText,
  formula: shortText,
});

/**
 * Initiative stats
 */
const initiativeStatsSchema = z.object({
  meatspace: initiativeSchema,
  astral: initiativeSchema.nullable(),
  matrix: initiativeSchema.nullable(),
});

/**
 * Derived stat
 */
const derivedStatSchema = z.object({
  dicePool: z.number().int().min(0),
  formula: shortText,
});

/**
 * Movement
 */
const movementSchema = z.object({
  walk: shortText,
  sprint: shortText,
});

/**
 * Unarmed DV
 */
const unarmedDVSchema = z.object({
  formula: shortText,
  value: z.number().int().min(0),
});

/**
 * Derived stats
 */
const derivedStatsSchema = z.object({
  initiative: initiativeStatsSchema,
  composure: derivedStatSchema,
  judgeIntentions: derivedStatSchema,
  memory: derivedStatSchema,
  liftCarry: derivedStatSchema,
  movement: movementSchema,
  unarmededDV: unarmedDVSchema,
  defenseRating: z.number().int().min(0),
});

/**
 * Edge points
 */
const edgePointsSchema = z.object({
  maximum: z.number().int().min(0).max(7),
  current: z.number().int().min(0).max(7),
});

/**
 * Condition monitor
 */
const conditionMonitorSchema = z.object({
  maximum: z.number().int().min(0),
  current: z.number().int().min(0),
  formula: shortText,
});

/**
 * Condition monitors
 */
const conditionMonitorsSchema = z.object({
  physical: conditionMonitorSchema,
  stun: conditionMonitorSchema,
  overflow: conditionMonitorSchema,
});

/**
 * Skill
 */
const skillSchema = z.object({
  rank: z.number().int().min(0).max(12),
  linkedAttribute: shortText.min(1),
  specialization: shortText.nullable(),
  expertise: shortText.nullable(),
  canDefault: z.boolean(),
});

/**
 * All skills
 */
const skillsSchema = z.object({
  astral: skillSchema,
  athletics: skillSchema,
  biotech: skillSchema,
  closeCombat: skillSchema,
  con: skillSchema,
  conjuring: skillSchema,
  cracking: skillSchema,
  electronics: skillSchema,
  enchanting: skillSchema,
  engineering: skillSchema,
  exoticWeapons: skillSchema,
  firearms: skillSchema,
  influence: skillSchema,
  outdoors: skillSchema,
  perception: skillSchema,
  piloting: skillSchema,
  sorcery: skillSchema,
  stealth: skillSchema,
  tasking: skillSchema,
});

/**
 * Knowledge skill
 */
const knowledgeSkillSchema = z.object({
  name: shortText.min(1),
  type: z.enum(['academic', 'professional', 'street']),
  rank: z.number().int().min(0).max(12),
});

/**
 * Language
 */
const languageSchema = z.object({
  name: shortText.min(1),
  proficiency: z.enum(['native', 'fluent', 'basic']),
});

/**
 * Quality
 */
const qualitySchema = z.object({
  name: shortText.min(1),
  type: z.enum(['positive', 'negative']),
  cost: z.number().int(),
  notes: longText,
});

/**
 * Attack ratings
 */
const attackRatingsSchema = z.object({
  close: z.number().int(),
  near: z.number().int().optional(),
  far: z.number().int().optional(),
  extreme: z.number().int().nullable().optional(),
});

/**
 * Ranged weapon
 */
const rangedWeaponSchema = z.object({
  name: shortText.min(1),
  type: shortText.min(1),
  dicePool: z.number().int().min(0),
  dv: shortText,
  attackRatings: attackRatingsSchema,
  firingModes: sheetList(shortText, SHEET_ROW_TAGS_MAX),
  capacity: z.number().int().min(0),
  ammoLoaded: z.number().int().min(0),
  ammoType: shortText,
  notes: longText,
});

/**
 * Melee weapon
 */
const meleeWeaponSchema = z.object({
  name: shortText.min(1),
  type: shortText.min(1),
  dicePool: z.number().int().min(0),
  dv: shortText,
  attackRatings: attackRatingsSchema,
  notes: longText,
});

/**
 * Weapons
 */
const weaponsSchema = z.object({
  ranged: sheetList(rangedWeaponSchema),
  melee: sheetList(meleeWeaponSchema),
});

/**
 * Armor
 */
const armorSchema = z.object({
  name: shortText.min(1),
  defenseRating: z.number().int().min(0),
  notes: longText,
  equipped: z.boolean(),
});

/**
 * Augmentation
 */
const augmentationSchema = z.object({
  name: shortText.min(1),
  rating: z.number().int().min(0),
  essenceCost: z.number().min(0),
  type: z.enum(['cyberware', 'bioware']),
  notes: longText,
});

/**
 * Matrix persona
 */
const matrixPersonaSchema = z.object({
  attack: z.number().int().min(0),
  sleaze: z.number().int().min(0),
  dataProcessing: z.number().int().min(0),
  firewall: z.number().int().min(0),
});

/**
 * Matrix initiative
 */
const matrixInitiativeSchema = z.object({
  base: z.number().int().nullable(),
  dicePools: shortText.nullable(),
  notes: longText,
});

/**
 * Matrix stats
 */
const matrixStatsSchema = z.object({
  hasMatrixDevice: z.boolean(),
  commlink: shortText,
  persona: matrixPersonaSchema,
  matrixConditionMonitor: z.object({
    maximum: z.number().int().min(0),
    current: z.number().int().min(0),
  }),
  programs: sheetList(shortText),
  matrixInitiative: matrixInitiativeSchema,
});

/**
 * Magic
 */
const magicSchema = z.object({
  isMagicallyActive: z.boolean(),
  tradition: shortText.nullable(),
  magicRating: z.number().int().min(0).max(12).nullable(),
  spells: sheetList(shortText),
  rituals: sheetList(shortText),
  preparations: sheetList(shortText),
  complexForms: sheetList(shortText),
  adeptPowers: sheetList(shortText),
  initiationGrade: z.number().int().min(0),
  submersionGrade: z.number().int().min(0),
  focii: sheetList(shortText),
});

/**
 * Contact
 */
const contactSchema = z.object({
  name: shortText.min(1),
  role: shortText.min(1),
  loyalty: z.number().int().min(1).max(6),
  connection: z.number().int().min(1).max(12),
  notes: longText,
});

/**
 * License
 */
const licenseSchema = z.object({
  type: shortText.min(1),
  rating: z.number().int().min(1).max(6),
});

/**
 * Fake ID
 */
const fakeIDSchema = z.object({
  name: shortText.min(1),
  type: shortText.min(1),
  rating: z.number().int().min(1).max(6),
  licenses: sheetList(licenseSchema, SHEET_ROW_TAGS_MAX),
});

/**
 * Currency
 */
const currencySchema = z.object({
  nuyen: z.number().int().min(0),
});

/**
 * Gear item
 */
const gearItemSchema = z.object({
  name: shortText.min(1),
  rating: z.number().int().min(0).nullable(),
  quantity: z.number().int().min(0),
  notes: longText,
});

/**
 * Appearance
 */
const appearanceSchema = z.object({
  age: z.union([shortText, z.number()]).transform(v => String(v)),
  height: shortText,
  weight: shortText,
  eyes: shortText,
  skin: shortText,
  hair: shortText,
});

/**
 * Personality
 */
const personalitySchema = z.object({
  traits: longText,
  ideals: longText,
  bonds: longText,
  flaws: longText,
});

/**
 * Complete Shadowrun 6e character data schema
 * Most fields are optional to support partial saves and incremental character building.
 *
 * REQUIRED fields (core identity & mechanics):
 * - characterName, metatype, archetype, attributes
 *
 * OPTIONAL fields (everything else):
 * - All other fields can be omitted and added progressively
 */
export const shadowrun6eCharacterDataSchema = z.object({
  themeColor: themeColorSchema,
  // Required: Core identity
  characterName: sheetCharacterNameSchema,
  metatype: shortText.min(1),
  archetype: shortText.min(1),
  attributes: attributesSchema,

  // Optional: Additional details
  playerName: shortText.min(1).optional(),
  primaryAlias: shortText.min(1).optional(),
  karma: karmaSchema.optional(),
  reputation: z.number().int().min(0).optional(),
  heat: z.number().int().min(0).optional(),
  personalData: personalDataSchema.optional(),
  derivedStats: derivedStatsSchema.optional(),
  edgePoints: edgePointsSchema.optional(),
  conditionMonitors: conditionMonitorsSchema.optional(),
  woundModifier: z.number().int().optional(),
  conditions: sheetList(shortText).optional(),
  skills: skillsSchema.optional(),
  knowledgeSkills: sheetList(knowledgeSkillSchema).optional(),
  languages: sheetList(languageSchema).optional(),
  qualities: sheetList(qualitySchema).optional(),
  weapons: weaponsSchema.optional(),
  armor: sheetList(armorSchema).optional(),
  augmentations: sheetList(augmentationSchema).optional(),
  matrixStats: matrixStatsSchema.optional(),
  magic: magicSchema.optional(),
  contacts: sheetList(contactSchema).optional(),
  ids: sheetList(fakeIDSchema).optional(),
  currency: currencySchema.optional(),
  gear: sheetList(gearItemSchema).optional(),
  vehicles: sheetList(shortText).optional(),
  appearance: appearanceSchema.optional(),
  personality: personalitySchema.optional(),
  backstory: longText.optional(),
  notes: longText.optional(),
});

/**
 * Type inference from schema
 */
export type SR6CharacterData = z.infer<typeof shadowrun6eCharacterDataSchema>;
