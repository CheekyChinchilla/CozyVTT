/**
 * Shadowrun 6e Zod Validation Schema
 * Runtime validation for Shadowrun 6e character data
 */

import { z } from 'zod';

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
  age: z.union([z.string(), z.number()]).transform(v => String(v)),
  sex: z.string(),
  height: z.string(),
  weight: z.string(),
  ethnicity: z.string(),
  lifestyle: z.string(),
  primaryArmor: z.string(),
  primaryRangedWeapon: z.string(),
  primaryMeleeWeapon: z.string(),
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
  dicePools: z.string(),
  formula: z.string(),
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
  formula: z.string(),
});

/**
 * Movement
 */
const movementSchema = z.object({
  walk: z.string(),
  sprint: z.string(),
});

/**
 * Unarmed DV
 */
const unarmedDVSchema = z.object({
  formula: z.string(),
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
  formula: z.string(),
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
  linkedAttribute: z.string().min(1),
  specialization: z.string().nullable(),
  expertise: z.string().nullable(),
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
  name: z.string().min(1),
  type: z.enum(['academic', 'professional', 'street']),
  rank: z.number().int().min(0).max(12),
});

/**
 * Language
 */
const languageSchema = z.object({
  name: z.string().min(1),
  proficiency: z.enum(['native', 'fluent', 'basic']),
});

/**
 * Quality
 */
const qualitySchema = z.object({
  name: z.string().min(1),
  type: z.enum(['positive', 'negative']),
  cost: z.number().int(),
  notes: z.string(),
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
  name: z.string().min(1),
  type: z.string().min(1),
  dicePool: z.number().int().min(0),
  dv: z.string(),
  attackRatings: attackRatingsSchema,
  firingModes: z.array(z.string()),
  capacity: z.number().int().min(0),
  ammoLoaded: z.number().int().min(0),
  ammoType: z.string(),
  notes: z.string(),
});

/**
 * Melee weapon
 */
const meleeWeaponSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  dicePool: z.number().int().min(0),
  dv: z.string(),
  attackRatings: attackRatingsSchema,
  notes: z.string(),
});

/**
 * Weapons
 */
const weaponsSchema = z.object({
  ranged: z.array(rangedWeaponSchema),
  melee: z.array(meleeWeaponSchema),
});

/**
 * Armor
 */
const armorSchema = z.object({
  name: z.string().min(1),
  defenseRating: z.number().int().min(0),
  notes: z.string(),
  equipped: z.boolean(),
});

/**
 * Augmentation
 */
const augmentationSchema = z.object({
  name: z.string().min(1),
  rating: z.number().int().min(0),
  essenceCost: z.number().min(0),
  type: z.enum(['cyberware', 'bioware']),
  notes: z.string(),
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
  dicePools: z.string().nullable(),
  notes: z.string(),
});

/**
 * Matrix stats
 */
const matrixStatsSchema = z.object({
  hasMatrixDevice: z.boolean(),
  commlink: z.string(),
  persona: matrixPersonaSchema,
  matrixConditionMonitor: z.object({
    maximum: z.number().int().min(0),
    current: z.number().int().min(0),
  }),
  programs: z.array(z.string()),
  matrixInitiative: matrixInitiativeSchema,
});

/**
 * Magic
 */
const magicSchema = z.object({
  isMagicallyActive: z.boolean(),
  tradition: z.string().nullable(),
  magicRating: z.number().int().min(0).max(12).nullable(),
  spells: z.array(z.string()),
  rituals: z.array(z.string()),
  preparations: z.array(z.string()),
  complexForms: z.array(z.string()),
  adeptPowers: z.array(z.string()),
  initiationGrade: z.number().int().min(0),
  submersionGrade: z.number().int().min(0),
  focii: z.array(z.string()),
});

/**
 * Contact
 */
const contactSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  loyalty: z.number().int().min(1).max(6),
  connection: z.number().int().min(1).max(12),
  notes: z.string(),
});

/**
 * License
 */
const licenseSchema = z.object({
  type: z.string().min(1),
  rating: z.number().int().min(1).max(6),
});

/**
 * Fake ID
 */
const fakeIDSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  rating: z.number().int().min(1).max(6),
  licenses: z.array(licenseSchema),
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
  name: z.string().min(1),
  rating: z.number().int().min(0).nullable(),
  quantity: z.number().int().min(0),
  notes: z.string(),
});

/**
 * Appearance
 */
const appearanceSchema = z.object({
  age: z.union([z.string(), z.number()]).transform(v => String(v)),
  height: z.string(),
  weight: z.string(),
  eyes: z.string(),
  skin: z.string(),
  hair: z.string(),
});

/**
 * Personality
 */
const personalitySchema = z.object({
  traits: z.string(),
  ideals: z.string(),
  bonds: z.string(),
  flaws: z.string(),
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
  // Required: Core identity
  characterName: z.string().min(1),
  metatype: z.string().min(1),
  archetype: z.string().min(1),
  attributes: attributesSchema,

  // Optional: Additional details
  playerName: z.string().min(1).optional(),
  primaryAlias: z.string().min(1).optional(),
  karma: karmaSchema.optional(),
  reputation: z.number().int().min(0).optional(),
  heat: z.number().int().min(0).optional(),
  personalData: personalDataSchema.optional(),
  derivedStats: derivedStatsSchema.optional(),
  edgePoints: edgePointsSchema.optional(),
  conditionMonitors: conditionMonitorsSchema.optional(),
  woundModifier: z.number().int().optional(),
  conditions: z.array(z.string()).optional(),
  skills: skillsSchema.optional(),
  knowledgeSkills: z.array(knowledgeSkillSchema).optional(),
  languages: z.array(languageSchema).optional(),
  qualities: z.array(qualitySchema).optional(),
  weapons: weaponsSchema.optional(),
  armor: z.array(armorSchema).optional(),
  augmentations: z.array(augmentationSchema).optional(),
  matrixStats: matrixStatsSchema.optional(),
  magic: magicSchema.optional(),
  contacts: z.array(contactSchema).optional(),
  ids: z.array(fakeIDSchema).optional(),
  currency: currencySchema.optional(),
  gear: z.array(gearItemSchema).optional(),
  vehicles: z.array(z.string()).optional(),
  appearance: appearanceSchema.optional(),
  personality: personalitySchema.optional(),
  backstory: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Type inference from schema
 */
export type SR6CharacterData = z.infer<typeof shadowrun6eCharacterDataSchema>;
