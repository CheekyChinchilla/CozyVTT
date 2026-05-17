import { z } from 'zod';

// ── Shared sub-schemas ──────────────────────────────────────────────────────

const TokenSizeSchema = z.object({
  width: z.number().int().min(1).max(10),
  height: z.number().int().min(1).max(10),
});

const TokenHpSchema = z.object({
  current: z.number().int().min(0).max(99999),
  max: z.number().int().min(1).max(99999),
  temp: z.number().int().min(0).max(99999),
});

const NameDescPairSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(5000),
});

const NpcStatBlockSchema = z.object({
  ac: z.number().int().min(0).max(99),
  speed: z.string().max(200),
  abilities: z.object({
    str: z.number().int().min(0).max(30),
    dex: z.number().int().min(0).max(30),
    con: z.number().int().min(0).max(30),
    int: z.number().int().min(0).max(30),
    wis: z.number().int().min(0).max(30),
    cha: z.number().int().min(0).max(30),
  }),
  savingThrows: z.record(z.string(), z.number()).optional(),
  skills: z.record(z.string(), z.number()).optional(),
  damageVulnerabilities: z.string().max(500).optional(),
  damageResistances: z.string().max(500).optional(),
  damageImmunities: z.string().max(500).optional(),
  conditionImmunities: z.string().max(500).optional(),
  senses: z.string().max(500).optional(),
  languages: z.string().max(500).optional(),
  challengeRating: z.string().max(10).optional(),
  xp: z.number().int().min(0).optional(),
  traits: z.array(NameDescPairSchema).max(50).optional(),
  actions: z.array(NameDescPairSchema).max(50).optional(),
  bonusActions: z.array(NameDescPairSchema).max(50).optional(),
  reactions: z.array(NameDescPairSchema).max(50).optional(),
  legendaryActions: z.array(NameDescPairSchema).max(50).optional(),
  creatureType: z.string().max(200).optional(),
  alignment: z.string().max(100).optional(),
  gameSystem: z.string().max(50).optional(),
  notes: z.string().max(5000).optional(),
}).passthrough();

// ── Create / Update schemas ─────────────────────────────────────────────────

export const CreateTokenTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  imageUrl: z.string().max(500).nullable().optional(),
  type: z.enum(['player', 'npc', 'object']).default('object'),
  disposition: z.enum(['friendly', 'neutral', 'hostile']).nullable().optional(),
  displayMode: z.enum(['pog', 'top-down', 'full-art']).default('pog'),
  size: TokenSizeSchema.default({ width: 1, height: 1 }),
  notes: z.string().max(5000).nullable().optional(),
  hp: TokenHpSchema.nullable().optional(),
  showHpBar: z.boolean().default(false),
  statBlock: NpcStatBlockSchema.nullable().optional(),
  sightRadius: z.number().min(0).max(200).nullable().optional(),
});

export const UpdateTokenTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  imageUrl: z.string().max(500).nullable().optional(),
  type: z.enum(['player', 'npc', 'object']).optional(),
  disposition: z.enum(['friendly', 'neutral', 'hostile']).nullable().optional(),
  displayMode: z.enum(['pog', 'top-down', 'full-art']).optional(),
  size: TokenSizeSchema.optional(),
  notes: z.string().max(5000).nullable().optional(),
  hp: TokenHpSchema.nullable().optional(),
  showHpBar: z.boolean().optional(),
  statBlock: NpcStatBlockSchema.nullable().optional(),
  sightRadius: z.number().min(0).max(200).nullable().optional(),
}).refine(
  (obj) => Object.keys(obj).length > 0,
  { message: 'At least one field must be provided' }
);

/** Schema for saving an existing map token as a template. */
export const SaveTokenAsTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  imageUrl: z.string().max(500).nullable().optional(),
  type: z.enum(['player', 'npc', 'object']).default('object'),
  disposition: z.enum(['friendly', 'neutral', 'hostile']).nullable().optional(),
  displayMode: z.enum(['pog', 'top-down', 'full-art']).default('pog'),
  size: TokenSizeSchema.default({ width: 1, height: 1 }),
  notes: z.string().max(5000).nullable().optional(),
  hp: TokenHpSchema.nullable().optional(),
  showHpBar: z.boolean().default(false),
  statBlock: NpcStatBlockSchema.nullable().optional(),
  sightRadius: z.number().min(0).max(200).nullable().optional(),
});

export type CreateTokenTemplateInput = z.infer<typeof CreateTokenTemplateSchema>;
export type UpdateTokenTemplateInput = z.infer<typeof UpdateTokenTemplateSchema>;
export type SaveTokenAsTemplateInput = z.infer<typeof SaveTokenAsTemplateSchema>;
