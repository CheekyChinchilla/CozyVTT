/**
 * D&D 5e Zod Validation Schema
 * Runtime validation for D&D 5e character data
 */

import { z } from 'zod';

/**
 * Ability score with modifier
 */
const abilityScoreSchema = z.object({
  score: z.number().int().min(1).max(30),
  modifier: z.number().int().min(-5).max(10),
});

/**
 * All ability scores
 */
const statsSchema = z.object({
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
  proficient: z.boolean(),
  bonus: z.number().int(),
});

/**
 * All saving throws
 */
const savingThrowsSchema = z.object({
  strength: savingThrowSchema,
  dexterity: savingThrowSchema,
  constitution: savingThrowSchema,
  intelligence: savingThrowSchema,
  wisdom: savingThrowSchema,
  charisma: savingThrowSchema,
});

/**
 * Skill
 */
const skillSchema = z.object({
  proficient: z.boolean(),
  expertise: z.boolean(),
  bonus: z.number().int(),
});

/**
 * All skills
 */
const skillsSchema = z.object({
  acrobatics: skillSchema,
  animalHandling: skillSchema,
  arcana: skillSchema,
  athletics: skillSchema,
  deception: skillSchema,
  history: skillSchema,
  insight: skillSchema,
  intimidation: skillSchema,
  investigation: skillSchema,
  medicine: skillSchema,
  nature: skillSchema,
  perception: skillSchema,
  performance: skillSchema,
  persuasion: skillSchema,
  religion: skillSchema,
  sleightOfHand: skillSchema,
  stealth: skillSchema,
  survival: skillSchema,
});

/**
 * Hit points
 */
const hitPointsSchema = z.object({
  maximum: z.number().int().min(1),
  current: z.number().int(),
  temporary: z.number().int().min(0),
});

/**
 * Hit dice
 */
const hitDiceSchema = z.object({
  class: z.string().min(1),
  total: z.string(),
  remaining: z.number().int().min(0),
});

/**
 * Death saves
 */
const deathSavesSchema = z.object({
  successes: z.number().int().min(0).max(3),
  failures: z.number().int().min(0).max(3),
});

/**
 * Attack/weapon
 * Notes, properties optional; allow empty damage/type for partial entries
 */
/**
 * One feature or trait.
 *
 * Accepts the plain string every sheet written before this change holds, and
 * normalises it to a named entry with no description. A string is not parsed
 * for a description: players type things like "NakuDama-Amphibious" and
 * "Fighting Style: Defense", and splitting on the punctuation would invent a
 * description out of half the name.
 */
const featureEntrySchema = z.union([
  z.string().transform((name) => ({ name: name.trim(), description: '' })),
  z.object({
    name: z.string().min(1),
    description: z.string().default(''),
  }),
]);

const attackSchema = z.object({
  name: z.string().min(1),
  attackBonus: z.number().int(),
  damageRoll: z.string().optional(),
  damageType: z.string().optional(),
  range: z.number().min(0).optional(),
  properties: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

/**
 * Currency
 */
const currencySchema = z.object({
  cp: z.number().int().min(0),
  sp: z.number().int().min(0),
  ep: z.number().int().min(0),
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
  weight: z.number().min(0).optional(),
  notes: z.string().optional(),
  equippable: z.boolean().optional(),
  equipped: z.boolean().optional(),
  requiresAttunement: z.boolean().optional(),
  attuned: z.boolean().optional(),
  value: z.number().min(0).optional(),
});

/**
 * Spell slot
 */
const spellSlotSchema = z.object({
  total: z.number().int().min(0),
  expended: z.number().int().min(0),
});

/**
 * Spell slots for all levels
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
});

/**
 * Spell
 */
const spellSchema = z.object({
  level: z.number().int().min(0).max(9),
  name: z.string().min(1),
  prepared: z.boolean(),
  ritual: z.boolean(),
  concentration: z.boolean(),
});

/**
 * Spellcasting
 * Class and ability recommended but optional for flexibility
 */
const spellcastingSchema = z.object({
  class: z.string().min(1).optional(),
  ability: z.string().min(1).optional(),
  spellSaveDC: z.number().int().min(1).optional(),
  spellAttackBonus: z.number().int().optional(),
  cantrips: z.array(z.string()).optional(),
  slots: spellSlotsSchema.optional(),
  spells: z.array(spellSchema).optional(),
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
 * Description optional to allow quick entries
 */
const alliesAndOrganizationsSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
});

/**
 * Complete D&D 5e character data schema
 * Most fields are optional to support partial saves and incremental character building.
 *
 * REQUIRED fields (core identity & mechanics):
 * - characterName, class, level, race, stats, proficiencyBonus
 *
 * OPTIONAL fields (everything else):
 * - All other fields can be omitted and added progressively
 */
export const dnd5eCharacterDataSchema = z.object({
  // Required: Core identity
  characterName: z.string().min(1),
  class: z.string().min(1),
  level: z.number().int().min(1).max(20),
  race: z.string().min(1),
  proficiencyBonus: z.number().int().min(2).max(6),
  stats: statsSchema,

  // Optional: Additional details
  playerName: z.string().min(1).optional(),
  background: z.string().min(1).optional(),
  alignment: z.string().min(1).optional(),
  experiencePoints: z.number().int().min(0).optional(),
  inspiration: z.boolean().optional(),
  savingThrows: savingThrowsSchema.optional(),
  skills: skillsSchema.optional(),
  passivePerception: z.number().int().min(1).optional(),
  // Additions to passive Perception that are not the Perception skill itself:
  // the Observant feat's +5, and items that raise passive scores. Mirrors
  // `initiativeBonus` below — the total above is derived from this plus the
  // skill, and kept for exports.
  passivePerceptionBonus: z.number().int().optional(),
  armorClass: z.number().int().min(1).optional(),
  initiative: z.number().int().optional(),
  // Bonuses to initiative that are not Dexterity: the Alert feat's flat +5,
  // Jack of All Trades / Remarkable Athlete, subclasses that add another
  // ability. Too varied to derive, so the sheet keeps one manual number and
  // adds it to the Dexterity modifier. `initiative` above is the resulting
  // total, kept for exports and anything else reading the blob.
  initiativeBonus: z.number().int().optional(),
  speed: z.number().int().min(0).optional(),
  hp: hitPointsSchema.optional(),
  conditions: z.array(z.string()).optional(),
  hitDice: z.array(hitDiceSchema).optional(),
  deathSaves: deathSavesSchema.optional(),
  attacks: z.array(attackSchema).optional(),
  currency: currencySchema.optional(),
  inventory: z.array(inventoryItemSchema).optional(),
  proficienciesAndLanguages: z.array(z.string()).optional(),
  // Features carry a name and an optional description. The built-in templates
  // always had descriptions — Second Wind's full rules text, and so on — but
  // wrote them to an undeclared `features` field that nothing read, so no
  // player has ever seen one.
  //
  // Plain strings are still accepted, and always will be: every sheet written
  // before this change holds them, exported JSON in someone's backups holds
  // them, and a string is exactly what a feature with no description is. They
  // are read as a name with an empty description — never split up to invent one.
  // See utils/featureEntries.
  featuresAndTraits: z.array(featureEntrySchema).optional(),
  spellcasting: spellcastingSchema.optional(),
  appearance: appearanceSchema.optional(),
  personality: personalitySchema.optional(),
  backstory: z.string().optional(),
  alliesAndOrganizations: alliesAndOrganizationsSchema.optional(),
  treasure: z.string().optional(),
  additionalFeaturesAndTraits: z.string().optional(),
});

/**
 * Type inference from schema
 */
export type DnD5eCharacterData = z.infer<typeof dnd5eCharacterDataSchema>;
