/**
 * The recap a DM writes for a session.
 *
 * Shared by the route that ends a session and the route that edits one
 * afterwards, so the two cannot disagree about how long a recap may be.
 */

import { z } from 'zod';

/**
 * Long enough for a recap of an evening's play, short enough that the column
 * cannot become a document store. The end-session route has always applied this
 * length; the edit route refuses rather than truncating, since silently losing
 * the end of what someone typed is worse than telling them.
 */
export const MAX_SESSION_NOTES_LENGTH = 2000;

export const UpdateSessionNotesSchema = z.object({
  notes: z
    .string()
    .max(MAX_SESSION_NOTES_LENGTH, {
      message: `Session notes are limited to ${MAX_SESSION_NOTES_LENGTH} characters`,
    }),
});
