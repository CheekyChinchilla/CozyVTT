// ============================================
// Style allowlists
//
// Values that end up inside CSS: the atmosphere filter on the map, the spirit
// realm's custom colour, and a character sheet's header colour. The server
// validates them at every write path and the client re-checks them at every
// render, both against these patterns, so a stored value can never load a
// resource or break out of the property it is written into.
//
// This file is byte-identical in backend/src/utils and frontend/src/utils; a
// backend test fails if the two copies drift.
// ============================================

/** A six-digit hex colour, the only colour form the editors produce. */
export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

/**
 * The header colour a character sheet stores: the name of one of the sheet's
 * presets ("Classic Red") or a hex colour from the custom picker. Empty means
 * no colour was chosen.
 */
export const THEME_COLOR_PATTERN = /^(|#[0-9A-Fa-f]{6}|[A-Za-z][A-Za-z0-9 ]{0,39})$/;

/**
 * An atmosphere period's CSS filter: `none`, empty, or any combination of the
 * four functions the atmosphere editor's sliders produce. `url()` and every
 * other function is refused.
 */
const FILTER_FUNCTION = String.raw`(?:(?:brightness|saturate|contrast)\(\d+(?:\.\d+)?\)|hue-rotate\(-?\d+(?:\.\d+)?deg\))`;
export const VIBE_FILTER_PATTERN = new RegExp(String.raw`^\s*(?:none|${FILTER_FUNCTION}(?:\s+${FILTER_FUNCTION})*)?\s*$`);

export function isSafeVibeFilter(value: string): boolean {
  return value.length <= 200 && VIBE_FILTER_PATTERN.test(value);
}

/** The spirit realm's named looks. */
export const SPIRIT_EFFECTS = ['wispy', 'ethereal', 'shadow', 'dream'] as const;
export type SpiritEffect = (typeof SPIRIT_EFFECTS)[number];

/**
 * A spirit layer style: a named look, or `custom:#RRGGBB` with an optional
 * `:<look>` naming the animation to use with the custom colour.
 */
export const SPIRIT_STYLE_PATTERN = /^(?:wispy|ethereal|shadow|dream|custom:#[0-9A-Fa-f]{6}(?::(?:wispy|ethereal|shadow|dream))?)$/;

export function isValidSpiritStyle(value: string): boolean {
  return SPIRIT_STYLE_PATTERN.test(value);
}

/**
 * The look and custom colour a style names. A value that does not match the
 * pattern reads as the default look with no custom colour, so anything stored
 * before the write paths were validated renders as plain wispy.
 */
export function parseSpiritStyle(value: string | null | undefined): { effect: SpiritEffect; customColor: string | null } {
  if (!value || !isValidSpiritStyle(value)) return { effect: 'wispy', customColor: null };
  if (!value.startsWith('custom:')) return { effect: value as SpiritEffect, customColor: null };
  const [color, effect] = value.slice('custom:'.length).split(':');
  return { effect: (effect as SpiritEffect | undefined) ?? 'wispy', customColor: color };
}
