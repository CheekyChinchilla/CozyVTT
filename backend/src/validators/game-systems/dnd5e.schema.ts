/**
 * D&D 5e Zod Validation Schema
 * Runtime validation for D&D 5e character data
 */

import { z } from 'zod';
import { featureEntrySchema } from './featureEntry.schema';

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
 * A check the eighteen skills do not cover.
 *
 * Tool proficiencies are why this exists: "proficiency with a tool allows you
 * to add your proficiency bonus to any ability check you make using that tool"
 * (Basic Rules p. 51) — the same arithmetic as a skill, with nowhere to live.
 * Players were recording Thieves' Tools as a weapon to get a rollable entry,
 * which put a lockpick on the combat tab and gave it an attack roll.
 *
 * The bonus is derived, not stored: ability modifier plus proficiency, doubled
 * for expertise, plus `otherBonus` for what the sheet cannot work out. Empty
 * names are tolerated because a row exists from the moment it is added; readers
 * drop them.
 */
const customSkillSchema = z.object({
  name: z.string().max(60),
  ability: z.enum([
    'strength',
    'dexterity',
    'constitution',
    'intelligence',
    'wisdom',
    'charisma',
  ]),
  proficient: z.boolean().optional(),
  expertise: z.boolean().optional(),
  otherBonus: z.number().int().min(-30).max(30).optional(),
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
 * A further way the same weapon or spell deals damage.
 *
 * A spear is 1d6 in one hand and 1d8 in two — "versatile (1d8)" in the Weapons
 * table (Basic Rules p. 48) — and one damage line cannot say that. The built-in
 * Longsword template recorded its two-handed die in the free-text note instead,
 * where nothing could roll it.
 *
 * Every field tolerates empty, because a row exists from the moment it is added
 * and is filled in afterwards. Readers skip a row with no dice in it.
 */
const additionalDamageSchema = z.object({
  label: z.string().max(60).optional(),
  damageRoll: z.string().max(60).optional(),
  damageType: z.string().max(40).optional(),
});

const attackSchema = z.object({
  name: z.string().min(1),
  attackBonus: z.number().int(),
  damageRoll: z.string().optional(),
  damageType: z.string().optional(),
  range: z.number().min(0).optional(),
  // Free text, deliberately not an enum. The eleven the rules name are the
  // common case, not the limit — a homebrew game may name any number more, and
  // the sheet draws a badge for whatever is stored. Bounded only so the field
  // cannot be used as storage, the same reason token conditions are bounded.
  properties: z.array(z.string().max(60)).max(20).optional(),
  notes: z.string().optional(),
  additionalDamage: z.array(additionalDamageSchema).max(10).optional(),
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
  // Empty is allowed, and means "does not cast". These are free-text boxes on
  // the sheet, so clearing one writes an empty string — which `min(1)` rejected,
  // meaning a player who emptied the field could not save their character at all.
  class: z.string().optional(),
  ability: z.string().optional(),
  spellSaveDC: z.number().int().min(1).optional(),
  spellAttackBonus: z.number().int().optional(),
  // Adjustments that are neither the proficiency bonus nor the ability
  // modifier: a Rod of the Pact Keeper, a Robe of the Archmagi. Kept apart from
  // each other because items exist that raise one and not the other — a Wand of
  // the War Mage adds to attack rolls alone. The two totals above are derived
  // from these and kept for exports, exactly as initiative and passive
  // Perception already are.
  spellSaveDCOtherBonus: z.number().int().optional(),
  spellAttackOtherBonus: z.number().int().optional(),
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
  customSkills: z.array(customSkillSchema).max(30).optional(),
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
  // Exhaustion is six cumulative levels, not a condition you either have or do
  // not (Basic Rules, Appendix A) — level 1 is disadvantage on ability checks,
  // level 6 is death. It used to be a checkbox in the list above, which could
  // not tell those apart. 0 means none.
  exhaustionLevel: z.number().int().min(0).max(6).optional(),
  hitDice: z.array(hitDiceSchema).optional(),
  deathSaves: deathSavesSchema.optional(),
  attacks: z.array(attackSchema).optional(),
  currency: currencySchema.optional(),
  inventory: z.array(inventoryItemSchema).optional(),
  // The four proficiency boxes as the player typed them: armour, weapons,
  // tools and languages, each free text.
  //
  // This was already being stored, but only because PUT /characters/:id writes
  // the body as sent rather than Zod's parsed output — the field was undeclared
  // and survived by accident. That is precisely how the built-in templates came
  // to seed fields nothing read, so it is declared properly here.
  //
  // `proficienciesAndLanguages` below is the same four boxes flattened into one
  // list, kept for exports and for sheets written before this existed. It
  // cannot replace this: flattening loses which box an entry came from, and
  // guessing it back filed anything unrecognised — Thieves' Cant, Druidic —
  // under weapons.
  // The array arm is legacy tolerance, not a supported shape. The editor used
  // to guard against `proficiencies` arriving as an array, so sheets in the
  // wild may carry one; rejecting those would make an upgraded instance unable
  // to save an affected character at all. Readers ignore the array and fall
  // back to `proficienciesAndLanguages`.
  proficiencies: z
    .union([
      z.object({
        armor: z.string().max(2000).optional(),
        weapons: z.string().max(2000).optional(),
        tools: z.string().max(2000).optional(),
        languages: z.string().max(2000).optional(),
      }),
      z.array(z.string()),
    ])
    .optional(),
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
