/**
 * A user's display name.
 *
 * Shared by registration (and the setup wizard, which registers through the
 * same service) and the profile edit route, so the two cannot disagree about
 * what a name may be. Other members see it in the roster, chat and dice log,
 * so a blank one or one the length of a document is refused here, not only by
 * the forms that happen to send it.
 */

import { z } from 'zod';
import { sanitizeInput } from '../utils/validation';

/** The limit the profile and register pages already enforce. */
export const MAX_DISPLAY_NAME_LENGTH = 50;

/**
 * Characters a name never keeps: controls (Cc), invisible formatting (Cf:
 * zero-width spaces and joiners, bidirectional overrides, isolates and marks,
 * the byte-order mark) and the line and paragraph separators. A right-to-left
 * override turns the rest of a name round wherever it is shown, and a name of
 * zero-width characters alone looks blank, so either lets one member pass for
 * another in the roster, chat and dice log.
 */
const INVISIBLE_IN_NAMES = /[\p{Cc}\p{Cf}\u2028\u2029]/gu;

/**
 * A display name as it is stored: invisible characters removed, then in
 * Unicode's composed form (NFC), so an accented letter typed as a letter and
 * an accent is the same name as the single accented letter, then stripped of
 * angle brackets and surrounding space.
 */
export function cleanDisplayName(name: string): string {
  return sanitizeInput(name.replace(INVISIBLE_IN_NAMES, '').normalize('NFC')).trim();
}

/**
 * Text only, cleaned as above, then 1 to 50 characters. The length is checked
 * after cleaning, so a name that is only spaces, brackets or invisible
 * characters counts as empty. Names are not unique: two people may share one.
 */
export const displayNameSchema = z
  .string({ error: 'Display name must be text' })
  .transform(cleanDisplayName)
  .pipe(
    z
      .string()
      .min(1, { error: 'Display name is required' })
      .max(MAX_DISPLAY_NAME_LENGTH, {
        error: `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer`,
      }),
  );

/**
 * Parse a display name, returning the cleaned name or the message to show.
 * Both callers answer a refusal with a 400 carrying this message.
 */
export function parseDisplayName(value: unknown): { ok: true; name: string } | { ok: false; message: string } {
  const parsed = displayNameSchema.safeParse(value);
  if (parsed.success) return { ok: true, name: parsed.data };
  return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid display name' };
}

/**
 * A user's avatar address: the avatar route for that same user, or null to
 * clear it.
 *
 * Every member's browser loads it, so it is not stored as sent. The app sets it
 * to exactly this address after uploading the picture, and the route serves
 * that user's newest avatar.
 */
export function parseAvatarUrl(
  value: unknown,
  userId: string,
): { ok: true; url: string | null } | { ok: false; message: string } {
  const own = `/api/assets/avatars/${userId}`;
  if (value === null || value === own) return { ok: true, url: value };
  return { ok: false, message: `avatarUrl must be ${own} or null` };
}
