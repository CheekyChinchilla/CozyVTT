import { z } from 'zod';
import { NpcStatBlockSchema } from './statBlock';
import { TokenSizeSchema, TokenHpSchema } from './tokens';

// ── Shared sub-schemas ──────────────────────────────────────────────────────

// Shared with the map-token routes — see validators/tokens. They used to live
// here alone, which is why a token placed on a map was never checked.

// The stat block schema lives in ./statBlock so the creature routes, token
// templates and campaign import all validate against one definition. The limits
// applied here are unchanged from when this schema was defined locally.

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
