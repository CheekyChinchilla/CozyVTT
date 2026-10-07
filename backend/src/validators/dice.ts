/**
 * What a `dice.roll` over the socket may carry.
 *
 * The expression itself is checked by the dice parser, which owns its length
 * limit; this only requires it to be text. The character name and purpose are
 * labels, stored with the roll and shown to the table, so they are bounded:
 * the name like every other name, the purpose a little longer, because the
 * sheets build it from a name ("<attack name> Damage (Versatile)").
 */

import { z } from 'zod';

export const MAX_ROLL_CHARACTER_NAME_LENGTH = 200;
export const MAX_ROLL_PURPOSE_LENGTH = 300;

export const DiceRollSchema = z.object(
  {
    expression: z.string({ error: 'Dice expression required' }).min(1, { error: 'Dice expression required' }),
    characterName: z
      .string({ error: 'Character name must be text' })
      .max(MAX_ROLL_CHARACTER_NAME_LENGTH, { error: `Character name must be ${MAX_ROLL_CHARACTER_NAME_LENGTH} characters or fewer` })
      .nullish(),
    purpose: z
      .string({ error: 'Purpose must be text' })
      .max(MAX_ROLL_PURPOSE_LENGTH, { error: `Purpose must be ${MAX_ROLL_PURPOSE_LENGTH} characters or fewer` })
      .nullish(),
    secret: z.boolean({ error: 'secret must be true or false' }).optional(),
  },
  { error: 'Dice expression required' }
);

export type DiceRollInput = z.infer<typeof DiceRollSchema>;
