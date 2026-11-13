// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * statBlock.ts
 * The single definition of what a valid NPC stat block looks like.
 *
 * This schema previously existed as two near-identical copies — one in
 * tokenTemplates.ts and one in campaignImport.ts — while the creature routes,
 * which are the main authoring path, validated nothing at all beyond
 * `typeof statBlock === 'object'`. That gap is why a saving throw of +30 could
 * be stored against a commoner and then rolled as 1d20+30.
 *
 * The two original copies used different length limits, so those are parameters
 * rather than hardcoded: each caller keeps exactly the limits it had, and only
 * the genuinely new constraints (bounded save/skill bonuses, proficiency
 * metadata) are shared.
 */

import { z } from 'zod';
import { MAX_PROFICIENCY_BONUS } from '../utils/rules/fifthEdition';
import { STAT_BLOCK_LIMITS, statBlockNumberBounds } from './statBlockLimits';
import { normaliseGameSystem } from '../legacy/gameSystemAliases';

/**
 * Storage bounds for any save or skill bonus. A Horror d100 creature's
 * skills are percentages and have their own highest (statBlockNumberBounds).
 *
 * Deliberately wider than 5E needs. 5E tops out around +28 (a CR 30
 * creature with a +10 ability and expertise on a +9 proficiency bonus), but
 * Fantasy d20 runs much higher: its creature-building benchmarks put an
 * extreme skill at +33 by level 15 and higher still beyond that. A 5E-shaped
 * bound would silently reject legitimate high-level Fantasy d20 creatures.
 *
 * This is a backstop against absurd or hostile data, not a rules check. What
 * stops a commoner being given a +30 save is the editor deriving the value from
 * ability scores and challenge rating, plus the warning it shows on an override
 * that its stat block cannot support.
 */
export const MIN_STORED_BONUS = STAT_BLOCK_LIMITS.minBonus;
export const MAX_STORED_BONUS = STAT_BLOCK_LIMITS.maxBonus;

/**
 * Cap on how many saves or skills one stat block may carry.
 *
 * Comfortably above the eighteen 5E skills plus six saves so custom and
 * non-5E entries fit, while still bounding the size of the stored JSON.
 */
const MAX_BONUS_ENTRIES = STAT_BLOCK_LIMITS.maxBonusEntries;

/** Max length of a save or skill key. */
const MAX_KEY_LENGTH = STAT_BLOCK_LIMITS.maxBonusKeyLength;

/**
 * The most a stat block may hold, as stored (its JSON, in characters), and
 * how many keys it may carry that the schema does not name. Unknown keys pass
 * through so older stored blocks survive a round trip, and nothing bounded
 * them: a token could carry a megabyte under one made-up key, a map's tokens
 * are one JSON column, and every drag of any token on the map read it all.
 *
 * The largest SRD 5.1 creature the Creature Library seeds, the Vampire, is
 * about 6,000 characters stored, so 64 KB is ten times it.
 */
export const MAX_STAT_BLOCK_LENGTH = 64 * 1024;
export const MAX_EXTRA_STAT_BLOCK_KEYS = 20;

export interface StatBlockSchemaOptions {
  /** Max entries in each of traits/actions/bonusActions/reactions/legendaryActions. */
  maxListEntries: number;
  /** Max length of an action or trait name. */
  maxNameLength: number;
  /** Max length of an action or trait description. */
  maxDescriptionLength: number;
  /** Max length of the speed string. */
  maxSpeedLength: number;
  /** Max length of the whole stat block as stored, in JSON characters. Unbounded when absent. */
  maxStoredLength?: number;
  /** Max keys the schema does not name. Unbounded when absent. */
  maxExtraKeys?: number;
}

/**
 * A map of save or skill keys to bonuses.
 *
 * Keys are not enumerated here on purpose: the stat block is shared across game
 * systems, and 5E's six ability saves, Fantasy d20's Fortitude/Reflex/Will
 * and any custom skill all have to fit. Which keys are *offered* is the editor's
 * job; this layer's job is to make the stored numbers sane.
 */
const bonusRecordOf = (value: z.ZodNumber) =>
  z
    .record(z.string().trim().min(1).max(MAX_KEY_LENGTH), value)
    .refine((record) => Object.keys(record).length <= MAX_BONUS_ENTRIES, {
      message: `At most ${MAX_BONUS_ENTRIES} entries are allowed`,
    });

const bonusRecordSchema = bonusRecordOf(z.number().int().min(MIN_STORED_BONUS).max(MAX_STORED_BONUS));

/**
 * Skills, bounded by game system in the stat block's own check
 * (statBlockNumberBounds): a Horror d100 skill is a percentage.
 */
const skillRecordSchema = bonusRecordOf(z.number());

/**
 * The six scores, bounded by game system in the stat block's own check
 * (statBlockNumberBounds): a Horror d100 creature keeps its
 * characteristics here, POW in Wisdom's slot and CHA in Charisma's.
 */
const abilitiesSchema = z.object({
  str: z.number(),
  dex: z.number(),
  con: z.number(),
  int: z.number(),
  wis: z.number(),
  cha: z.number(),
});
type AbilityKey = keyof z.infer<typeof abilitiesSchema>;
const ABILITY_KEYS = Object.keys(abilitiesSchema.shape) as AbilityKey[];

/** Report a value's issues against `schema` at `path` in the stat block. */
function checkNumber(ctx: z.RefinementCtx, schema: z.ZodNumber, value: number, path: (string | number)[]): void {
  const result = schema.safeParse(value);
  if (result.success) return;
  for (const issue of result.error.issues) ctx.addIssue({ ...issue, path: [...path, ...issue.path] });
}

/**
 * How proficient a creature is in a save or skill.
 * 'custom' marks a bonus that is set explicitly rather than derived.
 */
export const ProficiencyLevelSchema = z.enum(['none', 'proficient', 'expertise', 'custom']);

const proficiencyLevelRecordSchema = z
  .record(z.string().trim().min(1).max(MAX_KEY_LENGTH), ProficiencyLevelSchema)
  .refine((record) => Object.keys(record).length <= MAX_BONUS_ENTRIES, {
    message: `At most ${MAX_BONUS_ENTRIES} entries are allowed`,
  });

/**
 * Proficiency metadata — the source of truth for a derived bonus.
 *
 * Optional throughout, which is what keeps this backward compatible: a stat
 * block with no proficiency metadata (every creature stored before this change,
 * including every seeded SRD monster) keeps its stored totals verbatim and is
 * read as legacy data rather than being recomputed.
 */
const proficienciesSchema = z.object({
  /**
   * Overrides the proficiency bonus that would be derived from challenge
   * rating. For the rare published monster whose printed values do not match
   * the CR table, and for homebrew.
   */
  bonusOverride: z.number().int().min(0).max(MAX_PROFICIENCY_BONUS).optional(),
  saves: proficiencyLevelRecordSchema.optional(),
  skills: proficiencyLevelRecordSchema.optional(),
});

/**
 * Build an NPC stat block schema with caller-specific length limits.
 *
 * `.passthrough()` is preserved from both original copies so unknown keys on
 * existing stored stat blocks survive a round trip rather than being stripped.
 */
export function createNpcStatBlockSchema(options: StatBlockSchemaOptions) {
  const nameDescPairSchema = z.object({
    name: z.string().max(options.maxNameLength),
    description: z.string().max(options.maxDescriptionLength),
  });

  const listSchema = z.array(nameDescPairSchema).max(options.maxListEntries).optional();

  const shape = {
    ac: z.number().int().min(0).max(99),
    // Optional: stat blocks created before HP tracking have neither field
    hpMax: z.number().int().min(1).max(99999).optional(),
    hitDice: z.string().max(STAT_BLOCK_LIMITS.maxHitDiceLength).optional(),
    speed: z.string().max(options.maxSpeedLength),
    // TODO(creatures): a Horror d100 creature has eight characteristics
    // and this stat block six slots, so SIZ and EDU have nowhere to go; its
    // skills are percentages kept in the bonus record. A Horror d100
    // creature model with all eight is the fix (docs/FUTURE_FEATURES.md,
    // Known issues).
    abilities: abilitiesSchema,
    // Attribute modifiers, for systems that print modifiers rather than
    // scores. Fantasy d20 stat blocks give "Str +4" with no underlying
    // score, so deriving one would be an invention.
    attributeModifiers: z
      .object({
        str: z.number().int().min(-10).max(20),
        dex: z.number().int().min(-10).max(20),
        con: z.number().int().min(-10).max(20),
        int: z.number().int().min(-10).max(20),
        wis: z.number().int().min(-10).max(20),
        cha: z.number().int().min(-10).max(20),
      })
      .optional(),
    // Creature level, for systems that rate creatures by level rather than
    // challenge rating. Fantasy d20 runs -1 to 25.
    level: z.number().int().min(-1).max(30).optional(),
    savingThrows: bonusRecordSchema.optional(),
    skills: skillRecordSchema.optional(),
    proficiencies: proficienciesSchema.optional(),
    damageVulnerabilities: z.string().max(STAT_BLOCK_LIMITS.maxDetailLength).optional(),
    damageResistances: z.string().max(STAT_BLOCK_LIMITS.maxDetailLength).optional(),
    damageImmunities: z.string().max(STAT_BLOCK_LIMITS.maxDetailLength).optional(),
    conditionImmunities: z.string().max(STAT_BLOCK_LIMITS.maxDetailLength).optional(),
    senses: z.string().max(STAT_BLOCK_LIMITS.maxDetailLength).optional(),
    languages: z.string().max(STAT_BLOCK_LIMITS.maxDetailLength).optional(),
    challengeRating: z.string().max(STAT_BLOCK_LIMITS.maxChallengeRatingLength).optional(),
    xp: z.number().int().min(0).optional(),
    traits: listSchema,
    actions: listSchema,
    bonusActions: listSchema,
    reactions: listSchema,
    legendaryActions: listSchema,
    creatureType: z.string().max(STAT_BLOCK_LIMITS.maxCreatureTypeLength).optional(),
    alignment: z.string().max(STAT_BLOCK_LIMITS.maxAlignmentLength).optional(),
    // The system the stat block's numbers are on. One an older version
    // named is stored as its new value; any other text is kept as given.
    gameSystem: z
      .string()
      .max(50)
      .optional()
      .transform((named) => normaliseGameSystem(named) ?? named),
    notes: z.string().max(STAT_BLOCK_LIMITS.maxNotesLength).optional(),
  };
  const named = new Set(Object.keys(shape));

  return z
    .object(shape)
    .passthrough()
    .superRefine((block, ctx) => {
      // Scores and skills, by the game system the stat block names.
      const bounds = statBlockNumberBounds(block.gameSystem);
      const score = z.number().int().min(bounds.minScore).max(bounds.maxScore);
      const skill = z.number().int().min(bounds.minSkill).max(bounds.maxSkill);
      for (const key of ABILITY_KEYS) checkNumber(ctx, score, block.abilities[key], ['abilities', key]);
      for (const [key, value] of Object.entries(block.skills ?? {})) checkNumber(ctx, skill, value, ['skills', key]);

      const extra = Object.keys(block).filter((key) => !named.has(key));
      if (options.maxExtraKeys !== undefined && extra.length > options.maxExtraKeys) {
        ctx.addIssue({
          code: 'custom',
          message: `Stat block has ${extra.length} fields it does not use (at most ${options.maxExtraKeys} are kept)`,
        });
      }
      if (options.maxStoredLength !== undefined && JSON.stringify(block).length > options.maxStoredLength) {
        ctx.addIssue({
          code: 'custom',
          message: `Stat block is too large (${Math.round(options.maxStoredLength / 1024)} KB maximum)`,
        });
      }
    });
}

/**
 * Limits for stat blocks authored in the app (creature library, token
 * templates). Matches what tokenTemplates.ts enforced before consolidation.
 * A campaign import holds stat blocks to these too, cutting text and lists
 * down to them, so anything imported can be placed and saved.
 */
export const AUTHORING_STAT_BLOCK_LIMITS: StatBlockSchemaOptions = {
  maxListEntries: STAT_BLOCK_LIMITS.maxListEntries,
  maxNameLength: STAT_BLOCK_LIMITS.maxEntryNameLength,
  maxDescriptionLength: STAT_BLOCK_LIMITS.maxEntryDescriptionLength,
  maxSpeedLength: STAT_BLOCK_LIMITS.maxSpeedLength,
  maxStoredLength: MAX_STAT_BLOCK_LENGTH,
  maxExtraKeys: MAX_EXTRA_STAT_BLOCK_KEYS,
};

/** Stat block schema for content authored in the app. */
export const NpcStatBlockSchema = createNpcStatBlockSchema(AUTHORING_STAT_BLOCK_LIMITS);

export type NpcStatBlockInput = z.infer<typeof NpcStatBlockSchema>;
