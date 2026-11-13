// ============================================
// Character request-body schemas.
// Validate the body SHAPE with Zod; game-system-specific validation of the
// `data` sheet stays in validateCharacterData (it depends on the resolved
// gameSystem), so `data` is left as free-form JSON here. On failure the route
// returns the same { error, message } 400 shape it always has.
// ============================================

import { z } from 'zod';
import { GameSystemSchema } from './gameSystem';
import { MAX_TEMPORARY_HIT_POINTS } from '../utils/rules/hitPoints';

/** POST /api/characters */
export const CreateCharacterSchema = z.object({
  name: z.string().trim().min(1, 'Character name is required').max(200, 'Character name must be 200 characters or fewer'),
  data: z.any().optional(),
  tokenImageUrl: z.string().nullish(),
  gameSystem: GameSystemSchema.nullish(),
  campaignId: z.string().nullish(),
});

/** PUT /api/characters/:id */
export const UpdateCharacterSchema = z.object({
  name: z.string().trim().min(1, 'Character name is required').max(200, 'Character name must be 200 characters or fewer').optional(),
  data: z.any().optional(),
  tokenImageUrl: z.string().nullish(),
  gameSystem: GameSystemSchema.nullish(),
  // The character's `updatedAt` as the caller loaded it. When sent, the save
  // is refused with 409 if the character has changed since; left out, the
  // save goes ahead whatever happened in between.
  updatedAt: z.iso.datetime({ message: 'updatedAt must be the ISO timestamp the character was loaded with' }).optional(),
});

/** What `character.hp.temporary` answers a payload that is not a character's id and a number, and nothing else. */
export const TEMPORARY_HP_PAYLOAD_REFUSAL = 'characterId (string) and temporary (number) are required';
/** What it answers a number of temporary hit points a grant may not give. */
export const TEMPORARY_HP_AMOUNT_REFUSAL =
  `temporary must be a whole number of hit points from 1 to ${MAX_TEMPORARY_HIT_POINTS.toLocaleString('en-US')}`;

/** `character.hp.temporary`: the character, and the temporary hit points it takes in place of any it has. */
export const CharacterTemporaryHpSchema = z.strictObject(
  {
    characterId: z.uuid({ error: TEMPORARY_HP_PAYLOAD_REFUSAL }),
    temporary: z
      .number({ error: TEMPORARY_HP_AMOUNT_REFUSAL })
      .int({ error: TEMPORARY_HP_AMOUNT_REFUSAL })
      .min(1, { error: TEMPORARY_HP_AMOUNT_REFUSAL })
      .max(MAX_TEMPORARY_HIT_POINTS, { error: TEMPORARY_HP_AMOUNT_REFUSAL }),
  },
  { error: TEMPORARY_HP_PAYLOAD_REFUSAL }
);
