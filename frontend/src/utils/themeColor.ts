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

/**
 * Whether text on a header of this `#rrggbb` colour should be white: true when
 * the colour's perceived brightness is under half, false for dark text.
 */
export function shouldUseWhiteText(hexColor: string): boolean {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}
