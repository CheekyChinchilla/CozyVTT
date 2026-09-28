/**
 * What accepting a campaign invitation may carry: the characters to bring.
 *
 * Without a schema, a `characterIds` that was not a list of ids reached the
 * database and answered 500. Fifty is far more characters than one player
 * brings to a table, and keeps the lookup bounded.
 */

import { z } from 'zod';

export const MAX_CHARACTERS_PER_ACCEPT = 50;

export const acceptInvitationSchema = z.object({
  characterIds: z
    .array(z.string().min(1, 'Each character id must be a non-empty string'), { error: 'characterIds must be a list of character ids' })
    .max(MAX_CHARACTERS_PER_ACCEPT, `At most ${MAX_CHARACTERS_PER_ACCEPT} characters can be brought at once`)
    .default([]),
});
