/**
 * creatures.ts
 * Validation for the creature-template routes.
 *
 * These routes previously accepted anything: the only checks were that `name`
 * was a string and `statBlock` was an object, after which the whole stat block
 * was written to JSONB unread. That is how a saving throw of +30 could be stored
 * against a commoner — the editor offered an unbounded number field and nothing
 * downstream disagreed.
 *
 * The stat block itself validates against the shared definition in ./statBlock,
 * which is the same one token templates and campaign import use.
 */

import { z } from 'zod';
import { TOKEN_DISPOSITIONS, TOKEN_DISPLAY_MODES } from './tokens';
import { GameSystem } from '@prisma/client';
import { NpcStatBlockSchema } from './statBlock';

const SizeSchema = z.object({
  width: z.number().int().min(1).max(10),
  height: z.number().int().min(1).max(10),
});

const DispositionSchema = z.enum(TOKEN_DISPOSITIONS);
const DisplayModeSchema = z.enum(TOKEN_DISPLAY_MODES);

/**
 * Fields shared by create and update. Kept separate so update can make every
 * field optional without repeating the constraints.
 */
const creatureFields = {
  gameSystem: z.nativeEnum(GameSystem).nullable().optional(),
  challengeRating: z.string().max(10).nullable().optional(),
  creatureType: z.string().max(200).nullable().optional(),
  alignment: z.string().max(100).nullable().optional(),
  imageUrl: z.string().max(500).nullable().optional(),
  size: SizeSchema.optional(),
  disposition: DispositionSchema.optional(),
  displayMode: DisplayModeSchema.optional(),
};

export const CreateCreatureSchema = z.object({
  name: z.string().trim().min(1, 'Creature name is required').max(200),
  statBlock: NpcStatBlockSchema,
  ...creatureFields,
});

export const UpdateCreatureSchema = z
  .object({
    name: z.string().trim().min(1, 'Creature name cannot be empty').max(200).optional(),
    statBlock: NpcStatBlockSchema.optional(),
    ...creatureFields,
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreateCreatureInput = z.infer<typeof CreateCreatureSchema>;
export type UpdateCreatureInput = z.infer<typeof UpdateCreatureSchema>;
