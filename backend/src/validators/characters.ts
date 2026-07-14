// ============================================
// Character request-body schemas.
// Validate the body SHAPE with Zod; game-system-specific validation of the
// `data` sheet stays in validateCharacterData (it depends on the resolved
// gameSystem), so `data` is left as free-form JSON here. On failure the route
// returns the same { error, message } 400 shape it always has.
// ============================================

import { z } from 'zod';
import { GameSystem } from '../game-systems';

/** POST /api/characters */
export const CreateCharacterSchema = z.object({
  name: z.string().trim().min(1, 'Character name is required').max(200, 'Character name must be 200 characters or fewer'),
  data: z.any().optional(),
  tokenImageUrl: z.string().nullish(),
  gameSystem: z.nativeEnum(GameSystem).nullish(),
  campaignId: z.string().nullish(),
});

/** PUT /api/characters/:id */
export const UpdateCharacterSchema = z.object({
  name: z.string().trim().min(1, 'Character name is required').max(200, 'Character name must be 200 characters or fewer').optional(),
  data: z.any().optional(),
  tokenImageUrl: z.string().nullish(),
  gameSystem: z.nativeEnum(GameSystem).nullish(),
});
