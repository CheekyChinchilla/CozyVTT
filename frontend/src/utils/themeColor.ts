/**
 * The custom header colour a character sheet saves.
 *
 * The server accepts a preset's name or a six-digit `#rrggbb` colour (see
 * styleAllowlists). The editors' hex box takes what a person types, and `#fff`
 * is a colour every browser understands, so the three-digit form is expanded
 * here. Anything else, from a bare `#` to five digits, is not a colour yet.
 */

import { isHexColor } from './styleAllowlists';

/** What the editors say when the hex box holds something that is not a colour. */
export const HEX_COLOUR_HINT = 'Enter a colour as #rgb or #rrggbb';

/** `value` as `#rrggbb`, or null when it is not a hex colour. */
export function toStoredHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (isHexColor(trimmed)) return trimmed;
  const short = /^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/.exec(trimmed);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : null;
}
