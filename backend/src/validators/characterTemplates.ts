// ============================================
// Character template request-body schemas.
//
// Same split as validators/characters.ts: Zod checks the body SHAPE here, and
// the sheet itself is checked by validateCharacterData in the route once the
// gameSystem is known. `data` is therefore free-form JSON at this layer.
// ============================================

import { z } from 'zod';
import { GameSystem } from '../game-systems';

/** POST /api/character-templates */
export const CreateCharacterTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Template name is required')
    .max(200, 'Template name must be 200 characters or fewer'),
  description: z.string().trim().max(2000, 'Description must be 2000 characters or fewer').nullish(),
  data: z.any().optional(),
  tokenImageUrl: z.string().max(500).nullish(),
  gameSystem: z.nativeEnum(GameSystem).nullish(),
});

/** PUT /api/character-templates/:id */
export const UpdateCharacterTemplateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Template name cannot be empty')
      .max(200, 'Template name must be 200 characters or fewer')
      .optional(),
    description: z.string().trim().max(2000).nullish(),
    data: z.any().optional(),
    tokenImageUrl: z.string().max(500).nullish(),
    // The template's `updatedAt` as the caller loaded it. When sent, the save
    // is refused with 409 if the template has changed since; left out, the
    // save goes ahead whatever happened in between.
    updatedAt: z.iso.datetime({ message: 'updatedAt must be the ISO timestamp the template was loaded with' }).optional(),
  })
  .refine((obj) => Object.keys(obj).some((key) => key !== 'updatedAt'), {
    message: 'At least one field must be provided',
  });

export type CreateCharacterTemplateInput = z.infer<typeof CreateCharacterTemplateSchema>;
export type UpdateCharacterTemplateInput = z.infer<typeof UpdateCharacterTemplateSchema>;
