/**
 * What a theme may be: the names of the app's themes and fonts, and the four
 * colours of a custom theme.
 *
 * Shared by a user's own preferences and the instance's default theme, which
 * the Admin Panel sets for every visitor, the sign-in page included. Both are
 * painted into CSS, so both are checked the same way.
 */

import { z } from 'zod';

// The theme and font ids of frontend/src/themes.ts; keepInStep.test.ts fails
// when the two differ. `custom` is a sentinel meaning the colours come from
// customThemeColors.
export const THEME_IDS = [
  'cozy-default',
  'autumn-hearth',
  'desert-sand',
  'rose-garden',
  'ocean-depths',
  'northern-frost',
  'enchanted-forest',
  'twilight-vale',
  'obsidian-night',
  'shadow-realm',
  'deep-dungeon',
  'midnight-court',
  'parchment-classic',
  'slate-modern',
  'dragonfire',
  'arcane-storm',
  'custom',
] as const;

export const FONT_IDS = [
  'default',
  'medieval',
  'elegant',
  'modern',
  'handwritten',
  'clean',
  'scholarly',
  'gothic',
] as const;

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export const CustomThemeColorsSchema = z.object({
  primary: z.string().regex(HEX_COLOR_REGEX, 'primary must be #RRGGBB'),
  accent: z.string().regex(HEX_COLOR_REGEX, 'accent must be #RRGGBB'),
  background: z.string().regex(HEX_COLOR_REGEX, 'background must be #RRGGBB'),
  text: z.string().regex(HEX_COLOR_REGEX, 'text must be #RRGGBB'),
}).strict();

export type CustomThemeColors = z.infer<typeof CustomThemeColorsSchema>;
