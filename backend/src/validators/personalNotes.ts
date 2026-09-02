/**
 * What a personal note may contain.
 *
 * Notes are Markdown source written by a player for themselves. The column is
 * `TEXT`, which Postgres will happily let grow to a gigabyte, so the bound that
 * actually protects the instance lives here — types are erased at runtime and
 * protect nothing.
 *
 * The size limit is not about what a note "should" be: people keep long session
 * logs and lore dumps, and that is the point of the feature. It is about a text
 * column not becoming file storage for an account that means harm. The panel
 * never ships note bodies in a list, so length costs nothing until a note is
 * actually opened.
 */

import { z } from 'zod';

/** Long enough for a heading that fits a dropdown, short enough to render. */
export const MAX_NOTE_TITLE_LENGTH = 120;

/**
 * Roughly 35,000 words — about fifty printed pages, per note.
 *
 * Generous for the longest thing anyone writes at a table, and still bounded.
 */
export const MAX_NOTE_CONTENT_LENGTH = 100_000;

/** Per user, per campaign. Guards the list query, not the writer's ambition. */
export const MAX_NOTES_PER_CAMPAIGN = 200;

export const CreatePersonalNoteSchema = z.object({
  title: z.string().trim().min(1, 'A note needs a title').max(MAX_NOTE_TITLE_LENGTH),
  // A note is usually created empty and written into afterwards.
  content: z.string().max(MAX_NOTE_CONTENT_LENGTH).optional(),
});

/**
 * Either field alone is a valid edit — the title is renamed from a dropdown,
 * the body is saved as it is typed — but a body with neither changes nothing
 * and is refused so a mistake is visible rather than silent.
 */
export const UpdatePersonalNoteSchema = z
  .object({
    title: z.string().trim().min(1, 'A note needs a title').max(MAX_NOTE_TITLE_LENGTH).optional(),
    content: z.string().max(MAX_NOTE_CONTENT_LENGTH).optional(),
  })
  .refine(
    (body) => body.title !== undefined || body.content !== undefined,
    { message: 'Nothing to update: send a title, content, or both' }
  );

export type CreatePersonalNoteInput = z.infer<typeof CreatePersonalNoteSchema>;
export type UpdatePersonalNoteInput = z.infer<typeof UpdatePersonalNoteSchema>;
