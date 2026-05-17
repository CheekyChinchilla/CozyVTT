/**
 * Pathfinder 2e Zod Validation Schema
 * Runtime validation for Pathfinder 2e character data
 */

import { z } from 'zod';

/**
 * Proficiency rank
 */
const proficiencyRankSchema = z.enum(['untrained', 'trained', 'expert', 'master', 'legendary']);

/**
 * Ability score
 */
const abilityScoreSchema = z.object({
  score: z.number().int().min(1).max(30),
  modifier: z.number().int().min(-5).max(10),
});

/**
 * All attributes
 */
const attributesSchema = z.object({
  strength: abilityScoreSchema,
  dexterity: abilityScoreSchema,
  constitution: abilityScoreSchema,
  intelligence: abilityScoreSchema,
  wisdom: abilityScoreSchema,
  charisma: abilityScoreSchema,
});

/**
 * Saving throw
 */
const savingThrowSchema = z.object({
  proficiencyRank: proficiencyRankSchema,
  itemBonus: z.number().int(),
  bonus: z.number().int(),
});

/**
 * All saving throws
 */
const savingThrowsSchema = z.object({
  fortitude: savingThrowSchema,
  reflex: savingThrowSchema,
  will: savingThrowSchema,
});

/**
 * Perception
 */
const perceptionSchema = z.object({
  proficiencyRank: proficiencyRankSchema,
  itemBonus: z.number().int(),
  bonus: z.number().int(),
  senses: z.array(z.string()),
});

/**
 * Skill
 */
const skillSchema = z.object({
  attribute: z.string().min(1),
  proficiencyRank: proficiencyRankSchema,
  armorPenalty: z.number().int(),
  itemBonus: z.number().int(),
  bonus: z.number().int(),
});

/**
 * All skills
 */
const skillsSchema = z.object({
  acrobatics: skillSchema,
  arcana: skillSchema,
  athletics: skillSchema,
  crafting: skillSchema,
  deception: skillSchema,
  diplomacy: skillSchema,
  intimidation: skillSchema,
  medicine: skillSchema,
  nature: skillSchema,
  occultism: skillSchema,
  performance: skillSchema,
  religion: skillSchema,
  society: skillSchema,
  stealth: skillSchema,
  survival: skillSchema,
  thievery: skillSchema,
});

/**
 * Lore skill
 */
const loreSkillSchema = z.object({
  name: z.string().min(1),
  attribute: z.string().min(1),
  proficiencyRank: proficiencyRankSchema,
  itemBonus: z.number().int(),
  bonus: z.number().int(),
});

/**
 * Armor class
 */
const armorClassSchema = z.object({
  total: z.number().int().min(10),
  proficiencyRank: proficiencyRankSchema,
  capDex: z.number().int().nullable(),
  itemBonus: z.number().int(),
  armorPenalty: z.number().int(),
});

/**
 * Class DC
 */
const classDCSchema = z.object({
  total: z.number().int().min(10),
  keyAttribute: z.string().min(1),
  proficiencyRank: proficiencyRankSchema,
});

/**
 * Initiative
 */
const initiativeSchema = z.object({
  usedStat: z.string().min(1),
  bonus: z.number().int(),
});

/**
 * Speed
 */
const speedSchema = z.object({
  land: z.number().int().min(0),
  other: z.array(z.string()),
});

/**
 * Hit points
 */
const hitPointsSchema = z.object({
  maximum: z.number().int().min(1),
  ancestryHp: z.number().int().min(0),
  classHpPerLevel: z.number().int().min(0),
  current: z.number().int(),
  temporary: z.number().int().min(0),
  resistances: z.array(z.string()),
  immunities: z.array(z.string()),
  weaknesses: z.array(z.string()),
});

/**
 * Death and dying
 */
const deathAndDyingSchema = z.object({
  dying: z.number().int().min(0),
  wounded: z.number().int().min(0),
  doomed: z.number().int().min(0),
});

/**
 * Weapon proficiencies
 */
const weaponProficienciesSchema = z.object({
  simple: proficiencyRankSchema,
  martial: proficiencyRankSchema,
  advanced: proficiencyRankSchema,
  unarmed: proficiencyRankSchema,
});

/**
 * Armor proficiencies
 */
const armorProficienciesSchema = z.object({
  unarmored: proficiencyRankSchema,
  light: proficiencyRankSchema,
  medium: proficiencyRankSchema,
  heavy: proficiencyRankSchema,
});

/**
 * All proficiencies
 */
const proficienciesSchema = z.object({
  weapons: weaponProficienciesSchema,
  armor: armorProficienciesSchema,
});

/**
 * Strike
 * Most fields optional for quick weapon addition
 */
const strikeSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['melee', 'ranged']).optional(),
  attackBonus: z.number().int().nullable().optional(),
  damageRoll: z.string().optional(),
  damageType: z.string().optional(),
  attributeModifier: z.string().min(1).optional(),
  proficiencyRank: proficiencyRankSchema.optional(),
  itemBonus: z.number().int().optional(),
  traits: z.array(z.string()).optional(),
  range: z.number().int().nullable().optional(),
  savingThrow: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Currency
 */
const currencySchema = z.object({
  cp: z.number().int().min(0),
  sp: z.number().int().min(0),
  gp: z.number().int().min(0),
  pp: z.number().int().min(0),
});

/**
 * Inventory item
 * Most fields optional for quick item addition
 */
const inventoryItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().min(0).optional(),
  bulk: z.union([z.number(), z.string()]).optional(),
  equippable: z.boolean().optional(),
  equipped: z.boolean().optional(),
  requiresAttunement: z.boolean().optional(),
  attuned: z.boolean().optional(),
  invested: z.boolean().optional(),
  value: z.number().min(0).optional(),
  notes: z.string().optional(),
});

/**
 * Bulk
 */
const bulkSchema = z.object({
  current: z.number().min(0),
  encumbered: z.number().min(0),
  maximum: z.number().min(0),
});

/**
 * Feat
 * Notes optional for quick feat addition
 */
const featSchema = z.object({
  level: z.number().int().min(1).max(20).optional(),
  name: z.string().min(1),
  notes: z.string().optional(),
});

/**
 * All feats
 */
const featsSchema = z.object({
  ancestryAndHeritage: z.array(featSchema),
  class: z.array(featSchema),
  skill: z.array(featSchema),
  general: z.array(featSchema),
  bonus: z.array(featSchema),
});

/**
 * Spell slot
 */
const spellSlotSchema = z.object({
  total: z.number().int().min(0),
  expended: z.number().int().min(0),
});

/**
 * Spell slots
 */
const spellSlotsSchema = z.object({
  '1': spellSlotSchema,
  '2': spellSlotSchema,
  '3': spellSlotSchema,
  '4': spellSlotSchema,
  '5': spellSlotSchema,
  '6': spellSlotSchema,
  '7': spellSlotSchema,
  '8': spellSlotSchema,
  '9': spellSlotSchema,
  '10': spellSlotSchema,
});

/**
 * Cantrip
 */
const cantripSchema = z.object({
  rank: z.number().int().min(1).max(10),
  name: z.string().min(1),
  prepared: z.boolean(),
});

/**
 * Spell
 */
const spellSchema = z.object({
  rank: z.number().int().min(1).max(10),
  name: z.string().min(1),
  prepared: z.boolean(),
  ritual: z.boolean(),
  heightened: z.boolean(),
});

/**
 * Spell attack bonus
 */
const spellAttackBonusSchema = z.object({
  proficiencyRank: proficiencyRankSchema,
  itemBonus: z.number().int(),
  bonus: z.number().int(),
});

/**
 * Spell DC
 */
const spellDCSchema = z.object({
  proficiencyRank: proficiencyRankSchema,
  itemBonus: z.number().int(),
  dc: z.number().int().min(10),
});

/**
 * Focus spells
 */
const focusSpellsSchema = z.object({
  focusPoints: z.object({
    total: z.number().int().min(0).max(3),
    current: z.number().int().min(0).max(3),
  }),
  spells: z.array(spellSchema),
});

/**
 * Innate spell
 * Most fields optional for quick spell addition
 */
const innateSpellSchema = z.object({
  rank: z.number().int().min(1).max(10).optional(),
  name: z.string().min(1),
  tradition: z.string().min(1).optional(),
  frequency: z.string().min(1).optional(),
  notes: z.string().optional(),
});

/**
 * Spellcasting
 * Most fields optional for progressive spellcasting setup
 */
const spellcastingSchema = z.object({
  tradition: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  keyAttribute: z.string().min(1).optional(),
  spellAttackBonus: spellAttackBonusSchema.optional(),
  spellDC: spellDCSchema.optional(),
  cantrips: z.array(cantripSchema).optional(),
  slots: spellSlotsSchema.optional(),
  spells: z.array(spellSchema).optional(),
  focusSpells: focusSpellsSchema.optional(),
  innateSpells: z.array(innateSpellSchema).optional(),
  rituals: z.array(z.string()).optional(),
});

/**
 * Appearance
 * All fields optional to allow partial character creation
 */
const appearanceSchema = z.object({
  age: z.union([z.string(), z.number()]).transform(v => String(v)).optional().nullable(),
  height: z.string().optional(),
  weight: z.string().optional(),
  eyes: z.string().optional(),
  skin: z.string().optional(),
  hair: z.string().optional(),
});

/**
 * Personality
 * All fields optional to allow partial character creation
 */
const personalitySchema = z.object({
  traits: z.string().optional(),
  ideals: z.string().optional(),
  bonds: z.string().optional(),
  flaws: z.string().optional(),
});

/**
 * Allies and organizations
 * All fields optional to allow quick entries
 */
const alliesAndOrganizationsSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
});

/**
 * Complete Pathfinder 2e character data schema
 * Most fields are optional to support partial saves and incremental character building.
 *
 * REQUIRED fields (core identity & mechanics):
 * - characterName, class, level, ancestry, heritage, attributes
 *
 * OPTIONAL fields (everything else):
 * - All other fields can be omitted and added progressively
 */
export const pathfinder2eCharacterDataSchema = z.object({
  // Required: Core identity
  characterName: z.string().min(1),
  class: z.string().min(1),
  level: z.number().int().min(1).max(20),
  ancestry: z.string().min(1),
  heritage: z.string().min(1),
  attributes: attributesSchema,

  // Optional: Additional details
  playerName: z.string().min(1).optional(),
  background: z.string().min(1).optional(),
  alignment: z.string().min(1).optional(),
  deity: z.string().min(1).optional(),
  experiencePoints: z.number().int().min(0).optional(),
  heroPoints: z.number().int().min(0).max(3).optional(),
  savingThrows: savingThrowsSchema.optional(),
  perception: perceptionSchema.optional(),
  skills: skillsSchema.optional(),
  loreSkills: z.array(loreSkillSchema).optional(),
  armorClass: armorClassSchema.optional(),
  classDC: classDCSchema.optional(),
  initiative: initiativeSchema.optional(),
  speed: speedSchema.optional(),
  hp: hitPointsSchema.optional(),
  conditions: z.array(z.string()).optional(),
  deathAndDying: deathAndDyingSchema.optional(),
  proficiencies: proficienciesSchema.optional(),
  strikes: z.array(strikeSchema).optional(),
  currency: currencySchema.optional(),
  inventory: z.array(inventoryItemSchema).optional(),
  bulk: bulkSchema.optional(),
  languages: z.array(z.string()).optional(),
  feats: featsSchema.optional(),
  classFeatures: z.array(z.string()).optional(),
  spellcasting: spellcastingSchema.optional(),
  appearance: appearanceSchema.optional(),
  personality: personalitySchema.optional(),
  backstory: z.string().optional(),
  alliesAndOrganizations: alliesAndOrganizationsSchema.optional(),
  notes: z.string().optional(),
  treasure: z.string().optional(),
});

/**
 * Type inference from schema
 */
export type PF2eCharacterData = z.infer<typeof pathfinder2eCharacterDataSchema>;
