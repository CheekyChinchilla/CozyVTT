/**
 * Pathfinder 2e Zod Validation Schema
 * Runtime validation for Pathfinder 2e character data
 */

import { z } from 'zod';
import { themeColorSchema } from './sheetChrome';
import {
  sheetCharacterNameSchema,
  sheetShortTextSchema as shortText,
  sheetLongTextSchema as longText,
} from './sheetText';
import { featureEntrySchema } from './featureEntry.schema';
import { alliesAndOrganizationsSchema } from './alliesAndOrganizations.schema';
import { sheetList } from './sheetLists';
import { PF2E_ITEM_BONUS_MAX, PF2E_ITEM_BONUS_MIN, SHEET_ROW_TAGS_MAX, SPELL_SLOTS_MAX } from './sheetLimits';

/**
 * An item bonus, or an item penalty. Held to the range any real or homebrew
 * item gives, since the editor adds it into a total that is rolled.
 */
const itemBonusMessage = `Must be from ${PF2E_ITEM_BONUS_MIN} to ${PF2E_ITEM_BONUS_MAX}`;
const itemBonusSchema = z
  .number()
  .int()
  .min(PF2E_ITEM_BONUS_MIN, itemBonusMessage)
  .max(PF2E_ITEM_BONUS_MAX, itemBonusMessage);

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
  itemBonus: itemBonusSchema,
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
  itemBonus: itemBonusSchema,
  bonus: z.number().int(),
  senses: sheetList(shortText),
});

/**
 * Skill
 */
const skillSchema = z.object({
  attribute: shortText.min(1),
  proficiencyRank: proficiencyRankSchema,
  armorPenalty: z.number().int(),
  itemBonus: itemBonusSchema,
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
/**
 * Ritual
 *
 * Either a bare name, or a name with the rank it is cast at. The editor writes
 * the second — a ritual has a rank in Pathfinder, and the editor offers a rank
 * selector — while this schema originally declared only the first, which made
 * a sheet with any ritual on it impossible to save. Both are accepted so that a
 * sheet written against the old declaration still loads.
 */
const ritualSchema = z.union([
  shortText.min(1),
  z.object({
    name: shortText.min(1),
    rank: z.number().int().min(1).max(10),
  }),
]);

const loreSkillSchema = z.object({
  name: shortText.min(1),
  attribute: shortText.min(1),
  proficiencyRank: proficiencyRankSchema,
  itemBonus: itemBonusSchema,
  bonus: z.number().int(),
});

/**
 * Armor class
 */
const armorClassSchema = z.object({
  // No minimum, nor on the class DC and spell DC totals: each is 10 plus a
  // modifier that can be negative (Dexterity 8 untrained gives AC 9), and the
  // editor works them out.
  total: z.number().int(),
  proficiencyRank: proficiencyRankSchema,
  capDex: z.number().int().nullable(),
  itemBonus: itemBonusSchema,
  armorPenalty: z.number().int(),
});

/**
 * Class DC
 */
const classDCSchema = z.object({
  total: z.number().int(),
  keyAttribute: shortText.min(1),
  proficiencyRank: proficiencyRankSchema,
});

/**
 * Initiative
 */
const initiativeSchema = z.object({
  usedStat: shortText.min(1),
  bonus: z.number().int(),
});

/**
 * Speed
 */
const speedSchema = z.object({
  land: z.number().int().min(0),
  other: sheetList(shortText),
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
  resistances: sheetList(shortText),
  immunities: sheetList(shortText),
  weaknesses: sheetList(shortText),
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
  name: shortText.min(1),
  type: z.enum(['melee', 'ranged']).optional(),
  attackBonus: z.number().int().nullable().optional(),
  damageRoll: shortText.optional(),
  damageType: shortText.optional(),
  attributeModifier: shortText.min(1).optional(),
  proficiencyRank: proficiencyRankSchema.optional(),
  itemBonus: itemBonusSchema.optional(),
  traits: sheetList(shortText, SHEET_ROW_TAGS_MAX).optional(),
  range: z.number().int().nullable().optional(),
  savingThrow: shortText.optional(),
  notes: longText.optional(),
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
  name: shortText.min(1),
  quantity: z.number().int().min(0).optional(),
  bulk: z.union([z.number(), shortText]).optional(),
  equippable: z.boolean().optional(),
  equipped: z.boolean().optional(),
  requiresAttunement: z.boolean().optional(),
  attuned: z.boolean().optional(),
  invested: z.boolean().optional(),
  value: z.number().min(0).optional(),
  notes: longText.optional(),
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
 * Notes optional for quick feat addition. `description` is what the editor's
 * text box under each feat writes; the built-in templates write `notes`.
 */
const featSchema = z.object({
  level: z.number().int().min(1).max(20).optional(),
  name: shortText.min(1),
  notes: longText.optional(),
  description: longText.optional(),
});

/**
 * All feats
 */
const featsSchema = z.object({
  ancestryAndHeritage: sheetList(featSchema),
  class: sheetList(featSchema),
  skill: sheetList(featSchema),
  general: sheetList(featSchema),
  bonus: sheetList(featSchema),
});

/**
 * Spell slot
 */
const slotCountMessage = `Must be from 0 to ${SPELL_SLOTS_MAX}`;
const slotCountSchema = z.number().int().min(0, slotCountMessage).max(SPELL_SLOTS_MAX, slotCountMessage);

/**
 * Bounded so that a total cannot be a number no sheet could use: a caster has
 * at most four slots of a rank, and the sheet shows what is left of them.
 */
const spellSlotSchema = z.object({
  total: slotCountSchema,
  expended: slotCountSchema,
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
  name: shortText.min(1),
  prepared: z.boolean(),
});

/**
 * Spell
 */
const spellSchema = z.object({
  rank: z.number().int().min(1).max(10),
  name: shortText.min(1),
  prepared: z.boolean(),
  ritual: z.boolean(),
  heightened: z.boolean(),
});

/**
 * Spell attack bonus
 */
const spellAttackBonusSchema = z.object({
  proficiencyRank: proficiencyRankSchema,
  itemBonus: itemBonusSchema,
  bonus: z.number().int(),
});

/**
 * Spell DC
 */
const spellDCSchema = z.object({
  proficiencyRank: proficiencyRankSchema,
  itemBonus: itemBonusSchema,
  dc: z.number().int(),
});

/**
 * Focus spells
 */
const focusSpellsSchema = z.object({
  focusPoints: z.object({
    total: z.number().int().min(0).max(3),
    current: z.number().int().min(0).max(3),
  }),
  spells: sheetList(spellSchema),
});

/**
 * Innate spell
 * Most fields optional for quick spell addition
 */
const innateSpellSchema = z.object({
  rank: z.number().int().min(1).max(10).optional(),
  name: shortText.min(1),
  tradition: shortText.min(1).optional(),
  // A text box on the sheet; empty when cleared.
  frequency: shortText.optional(),
  notes: longText.optional(),
});

/**
 * Spellcasting
 * Most fields optional for progressive spellcasting setup
 */
const spellcastingSchema = z.object({
  tradition: shortText.min(1).optional(),
  type: shortText.min(1).optional(),
  keyAttribute: shortText.min(1).optional(),
  spellAttackBonus: spellAttackBonusSchema.optional(),
  spellDC: spellDCSchema.optional(),
  cantrips: sheetList(cantripSchema).optional(),
  slots: spellSlotsSchema.optional(),
  spells: sheetList(spellSchema).optional(),
  focusSpells: focusSpellsSchema.optional(),
  innateSpells: sheetList(innateSpellSchema).optional(),
  rituals: sheetList(ritualSchema).optional(),
});

/**
 * Appearance
 * All fields optional to allow partial character creation
 */
const appearanceSchema = z.object({
  age: z.union([shortText, z.number()]).transform(v => String(v)).optional().nullable(),
  height: shortText.optional(),
  weight: shortText.optional(),
  eyes: shortText.optional(),
  skin: shortText.optional(),
  hair: shortText.optional(),
});

/**
 * Personality
 * All fields optional to allow partial character creation
 */
const personalitySchema = z.object({
  traits: longText.optional(),
  ideals: longText.optional(),
  bonds: longText.optional(),
  flaws: longText.optional(),
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
  themeColor: themeColorSchema,
  // Required: Core identity
  characterName: sheetCharacterNameSchema,
  class: shortText.min(1),
  level: z.number().int().min(1).max(20),
  ancestry: shortText.min(1),
  heritage: shortText.min(1),
  attributes: attributesSchema,

  // Optional: Additional details
  playerName: shortText.min(1).optional(),
  // Empty is allowed: these are text boxes on the sheet, and clearing one
  // writes an empty string, which `min(1)` refused along with the whole save.
  background: shortText.optional(),
  alignment: shortText.optional(),
  deity: shortText.optional(),
  experiencePoints: z.number().int().min(0).optional(),
  heroPoints: z.number().int().min(0).max(3).optional(),
  savingThrows: savingThrowsSchema.optional(),
  perception: perceptionSchema.optional(),
  skills: skillsSchema.optional(),
  loreSkills: sheetList(loreSkillSchema).optional(),
  armorClass: armorClassSchema.optional(),
  classDC: classDCSchema.optional(),
  initiative: initiativeSchema.optional(),
  speed: speedSchema.optional(),
  hp: hitPointsSchema.optional(),
  conditions: sheetList(shortText).optional(),
  deathAndDying: deathAndDyingSchema.optional(),
  proficiencies: proficienciesSchema.optional(),
  strikes: sheetList(strikeSchema).optional(),
  currency: currencySchema.optional(),
  inventory: sheetList(inventoryItemSchema).optional(),
  bulk: bulkSchema.optional(),
  languages: sheetList(shortText).optional(),
  feats: featsSchema.optional(),
  // Named class features with optional rules text. Strings are still
  // accepted — that is what every sheet written so far holds, and what a
  // feature with no description is. See validators/game-systems/featureEntry.
  classFeatures: sheetList(featureEntrySchema).optional(),
  spellcasting: spellcastingSchema.optional(),
  appearance: appearanceSchema.optional(),
  personality: personalitySchema.optional(),
  backstory: longText.optional(),
  alliesAndOrganizations: alliesAndOrganizationsSchema.optional(),
  notes: longText.optional(),
  treasure: longText.optional(),
});

/**
 * Type inference from schema
 */
export type PF2eCharacterData = z.infer<typeof pathfinder2eCharacterDataSchema>;
