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
import {
  MAX_ABILITY_SCORE,
  MAX_PROFICIENCY_BONUS,
  MIN_ABILITY_SCORE,
} from '../utils/rules/dnd5e';

/**
 * Storage bounds for any save or skill bonus, across every game system.
 *
 * Deliberately wider than D&D 5e needs. 5e tops out around +28 (a CR 30
 * creature with a +10 ability and expertise on a +9 proficiency bonus), but
 * Pathfinder 2e runs much higher: its creature-building benchmarks put an
 * extreme skill at +33 by level 15 and higher still beyond that. A 5e-shaped
 * bound would silently reject legitimate high-level PF2e creatures.
 *
 * This is a backstop against absurd or hostile data, not a rules check. What
 * stops a commoner being given a +30 save is the editor deriving the value from
 * ability scores and challenge rating, plus the warning it shows on an override
 * that its stat block cannot support.
 */
export const MIN_STORED_BONUS = -50;
export const MAX_STORED_BONUS = 50;

/**
 * Cap on how many saves or skills one stat block may carry.
 *
 * Comfortably above the eighteen 5e skills plus six saves so custom and
 * non-5e entries fit, while still bounding the size of the stored JSON.
 */
const MAX_BONUS_ENTRIES = 60;

/** Max length of a save or skill key. */
const MAX_KEY_LENGTH = 50;

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
 * systems, and D&D 5e's six ability saves, Pathfinder 2e's Fortitude/Reflex/Will
 * and any custom skill all have to fit. Which keys are *offered* is the editor's
 * job; this layer's job is to make the stored numbers sane.
 */
const bonusRecordSchema = z
  .record(
    z.string().trim().min(1).max(MAX_KEY_LENGTH),
    z.number().int().min(MIN_STORED_BONUS).max(MAX_STORED_BONUS)
  )
  .refine((record) => Object.keys(record).length <= MAX_BONUS_ENTRIES, {
    message: `At most ${MAX_BONUS_ENTRIES} entries are allowed`,
  });

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
    hitDice: z.string().max(50).optional(),
    speed: z.string().max(options.maxSpeedLength),
    abilities: z.object({
      str: z.number().int().min(MIN_ABILITY_SCORE).max(MAX_ABILITY_SCORE),
      dex: z.number().int().min(MIN_ABILITY_SCORE).max(MAX_ABILITY_SCORE),
      con: z.number().int().min(MIN_ABILITY_SCORE).max(MAX_ABILITY_SCORE),
      int: z.number().int().min(MIN_ABILITY_SCORE).max(MAX_ABILITY_SCORE),
      wis: z.number().int().min(MIN_ABILITY_SCORE).max(MAX_ABILITY_SCORE),
      cha: z.number().int().min(MIN_ABILITY_SCORE).max(MAX_ABILITY_SCORE),
    }),
    // Attribute modifiers, for systems that print modifiers rather than
    // scores. Pathfinder 2e stat blocks give "Str +4" with no underlying
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
    // challenge rating. PF2e runs -1 to 25.
    level: z.number().int().min(-1).max(30).optional(),
    savingThrows: bonusRecordSchema.optional(),
    skills: bonusRecordSchema.optional(),
    proficiencies: proficienciesSchema.optional(),
    damageVulnerabilities: z.string().max(500).optional(),
    damageResistances: z.string().max(500).optional(),
    damageImmunities: z.string().max(500).optional(),
    conditionImmunities: z.string().max(500).optional(),
    senses: z.string().max(500).optional(),
    languages: z.string().max(500).optional(),
    challengeRating: z.string().max(10).optional(),
    xp: z.number().int().min(0).optional(),
    traits: listSchema,
    actions: listSchema,
    bonusActions: listSchema,
    reactions: listSchema,
    legendaryActions: listSchema,
    creatureType: z.string().max(200).optional(),
    alignment: z.string().max(100).optional(),
    gameSystem: z.string().max(50).optional(),
    notes: z.string().max(5000).optional(),
  };
  const named = new Set(Object.keys(shape));

  return z
    .object(shape)
    .passthrough()
    .superRefine((block, ctx) => {
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
  maxListEntries: 50,
  maxNameLength: 200,
  maxDescriptionLength: 5000,
  maxSpeedLength: 200,
  maxStoredLength: MAX_STAT_BLOCK_LENGTH,
  maxExtraKeys: MAX_EXTRA_STAT_BLOCK_KEYS,
};

/** Stat block schema for content authored in the app. */
export const NpcStatBlockSchema = createNpcStatBlockSchema(AUTHORING_STAT_BLOCK_LIMITS);

export type NpcStatBlockInput = z.infer<typeof NpcStatBlockSchema>;
