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
import { DISPLAY_NAME_MIN_LENGTH, DISPLAY_NAME_MAX_LENGTH } from './accountLimits';

/** The most characters a display name has (accountLimits.ts). */
export const MAX_DISPLAY_NAME_LENGTH = DISPLAY_NAME_MAX_LENGTH;

/**
 * Characters a name does not keep: controls (Cc), invisible formatting (Cf:
 * zero-width spaces, word joiners, bidirectional overrides, isolates and
 * marks, the byte-order mark, tag characters) and the line and paragraph
 * separators. A right-to-left override turns the rest of a name round wherever
 * it is shown, and a name of zero-width characters alone looks blank, so
 * either lets one member pass for another in the roster, chat and dice log.
 *
 * Two kinds are kept where real text needs them. A flag for Scotland, Wales
 * or England is a black flag followed by invisible tag letters and digits
 * and a cancel tag, and is kept whole; a tag anywhere else is removed. The
 * zero-width non-joiner and joiner are kept by keptJoiners below.
 */
const INVISIBLE_IN_NAMES = /\u{1F3F4}[\u{E0030}-\u{E0039}\u{E0061}-\u{E007A}]+\u{E007F}|[\p{Cc}\p{Cf}\u2028\u2029]/gu;
const BLACK_FLAG = '\u{1F3F4}';
const ZWNJ = '\u200C';
const ZWJ = '\u200D';

/** A character a joiner may stand beside: neither ASCII, nor space, nor anything invisible. */
function joinable(ch: string | undefined): boolean {
  return ch !== undefined && (ch.codePointAt(0) ?? 0) > 0x7f && !/[\s\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(ch);
}

/**
 * The zero-width non-joiner and joiner, kept only between two characters that
 * are neither ASCII nor space: that is where emoji sequences (a family, a
 * profession, a skin tone) and Persian, Urdu and Indic names use them. Two
 * accented letters are neither, so one between them is kept too. At either
 * end, repeated, or beside an ASCII character or a space they are removed,
 * so they cannot hide inside a name typed in ASCII and make it look like
 * another.
 */
function keptJoiners(name: string): string {
  const chars = Array.from(name);
  return chars
    .filter((ch, i) => (ch !== ZWNJ && ch !== ZWJ) || (joinable(chars[i - 1]) && joinable(chars[i + 1])))
    .join('');
}

/**
 * A display name as it is stored: invisible characters removed (bar the
 * joiners and flag tags above), then in Unicode's composed form (NFC), so an
 * accented letter typed as a letter and an accent is the same name as the
 * single accented letter, then stripped of angle brackets and surrounding
 * space.
 */
export function cleanDisplayName(name: string): string {
  const visible = name.replace(INVISIBLE_IN_NAMES, (found) =>
    found.startsWith(BLACK_FLAG) || found === ZWNJ || found === ZWJ ? found : ''
  );
  return sanitizeInput(keptJoiners(visible.normalize('NFC'))).trim();
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
      .min(DISPLAY_NAME_MIN_LENGTH, { error: 'Display name is required' })
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
