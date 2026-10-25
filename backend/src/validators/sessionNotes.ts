/**
 * The recap a DM writes for a session.
 *
 * Shared by the route that ends a session and the route that edits one
 * afterwards, so the two cannot disagree about how long a recap may be.
 */

import { z } from 'zod';

/**
 * Long enough for a recap of an evening's play, short enough that the column
 * cannot become a document store. Both routes refuse a longer recap instead of
 * cutting it, since silently losing the end of what someone typed is worse
 * than telling them.
 */
export const MAX_SESSION_NOTES_LENGTH = 2000;

const SessionNotesField = z
  .string({ error: 'Session notes must be text' })
  .max(MAX_SESSION_NOTES_LENGTH, {
    message: `Session notes are limited to ${MAX_SESSION_NOTES_LENGTH} characters`,
  });

export const UpdateSessionNotesSchema = z.object({
  notes: SessionNotesField,
});

/** PUT .../sessions/:sessionId/end. The state is saved unless `saveState` is false. */
export const EndSessionSchema = z.object({
  saveState: z.boolean({ error: 'saveState must be true or false' }).optional(),
  notes: SessionNotesField.nullish(),
});
