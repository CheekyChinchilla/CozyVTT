/**
 * The custom header colour a character sheet saves.
 *
 * The server accepts a preset's name or a six-digit `#rrggbb` colour (see
 * styleAllowlists). The editors' hex box takes what a person types, and `#fff`
 * is a colour every browser understands, so the three-digit form is expanded
 * here. Anything else, from a bare `#` to five digits, is not a colour yet.
 */

import { isHexColor } from './styleAllowlists';
import { parseRgb, readableTextOn, relativeLuminance, toChannels } from './color';

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
 * the readable text colour for it (readableTextOn, which the themes use too)
 * is lighter than the colour, false for dark text. One rule, so a sheet's
 * editor and its read-only view cannot choose differently.
 */
export function shouldUseWhiteText(hexColor: string): boolean {
  const hex = hexColor.replace('#', '');
  const background = parseRgb([0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(' '));
  const text = parseRgb(readableTextOn(toChannels(background)));
  return relativeLuminance(text) > relativeLuminance(background);
}

/**
 * The classes for what sits on a read-only sheet's header of this `#rrggbb`
 * colour: its text, softer text, and the translucent fills and borders of its
 * buttons, chips and picture, light on a dark header and dark on a light one.
 */
export function headerInk(hexColor: string) {
  const white = shouldUseWhiteText(hexColor);
  return {
    text: white ? 'text-white' : 'text-black',
    soft: white ? 'text-white/90' : 'text-black/80',
    softer: white ? 'text-white/80' : 'text-black/80',
    button: white ? 'bg-white/20 hover:bg-white/30' : 'bg-black/10 hover:bg-black/20',
    chip: white ? 'bg-white/20' : 'bg-black/10',
    chipFaint: white ? 'bg-white/10' : 'bg-black/5',
    border: white ? 'border-white/20' : 'border-black/20',
  };
}
