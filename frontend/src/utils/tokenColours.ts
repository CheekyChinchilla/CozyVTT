/**
 * The fixed colours a token is drawn in: its disposition (or the player
 * colour) and its HP bar. The map draws them, and the panels that show a
 * disposition or an HP bar use the same ones, as theme tokens (token-*,
 * derived in themes.ts with a readable text shade each), so a friendly
 * creature is the same teal in the Creature Library as on the map.
 *
 * Channels, as in the theme (r g b).
 */
export const TOKEN_HUES = {
  player: '59 130 246',
  hostile: '239 68 68',
  friendly: '45 212 191',
  neutral: '251 191 36',
  /** An object, or a token whose kind a player was not sent. */
  object: '120 113 108',
} as const;

/** The HP bar's colour, by how much is left. */
export const HP_HUES = {
  full: '34 197 94',
  good: '132 204 22',
  low: '245 158 11',
  critical: '239 68 68',
} as const;

export type HpTier = keyof typeof HP_HUES;

/** The tier of a fraction of HP left, 0 to 1. */
export function hpTier(fraction: number): HpTier {
  return fraction >= 0.75 ? 'full' : fraction >= 0.5 ? 'good' : fraction >= 0.25 ? 'low' : 'critical';
}

/** A colour for the canvas or an inline style. */
export const hueColour = (channels: string): string => `rgb(${channels})`;

/**
 * A disposition button that is picked, in the token editor, Token Manager and
 * Creature Library: the disposition's tint, border and readable text.
 */
export const DISPOSITION_PICKED = {
  friendly: 'border-token-friendly bg-token-friendly/10 text-token-friendly-ink font-semibold',
  neutral: 'border-token-neutral bg-token-neutral/10 text-token-neutral-ink font-semibold',
  hostile: 'border-token-hostile bg-token-hostile/10 text-token-hostile-ink font-semibold',
} as const;

/** A creature or template with no picture: its first letter on its disposition's colour. */
export const DISPOSITION_PLACEHOLDER = {
  friendly: 'bg-token-friendly text-black',
  neutral: 'bg-token-neutral text-black',
  hostile: 'bg-token-hostile text-black',
} as const;
