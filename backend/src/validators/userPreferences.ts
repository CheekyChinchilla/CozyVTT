/**
 * User Preferences validator
 *
 * Per-user theme/font/UX preferences stored in `User.preferences` JSON column.
 * See PER_USER_THEMES_PLAN.md.
 */

import { z } from 'zod';

// Allowed theme + font ids (must be kept in sync with frontend/src/themes.ts).
// `custom` is a sentinel meaning the user has dialed in colors via customThemeColors.
const ALLOWED_THEME_IDS = [
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

const ALLOWED_FONT_IDS = [
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

const CustomThemeColorsSchema = z.object({
  primary: z.string().regex(HEX_COLOR_REGEX, 'primary must be #RRGGBB'),
  accent: z.string().regex(HEX_COLOR_REGEX, 'accent must be #RRGGBB'),
  background: z.string().regex(HEX_COLOR_REGEX, 'background must be #RRGGBB'),
  text: z.string().regex(HEX_COLOR_REGEX, 'text must be #RRGGBB'),
}).strict();

/**
 * Full preferences schema. All fields optional so the same shape can be used
 * for partial-merge PATCH-style updates. `.strip()` discards any unknown keys
 * silently — clients can't smuggle extra fields into the JSON column.
 */
export const UserPreferencesSchema = z.object({
  themeId: z.enum(ALLOWED_THEME_IDS).optional(),
  customThemeColors: CustomThemeColorsSchema.nullable().optional(),
  fontId: z.enum(ALLOWED_FONT_IDS).optional(),
}).strip();

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

/**
 * Update payload — same shape, but rejects empty objects so callers can't
 * make a no-op write.
 */
export const UpdateUserPreferencesSchema = UserPreferencesSchema.refine(
  (obj) => Object.keys(obj).length > 0,
  { message: 'At least one preference field must be provided' }
);
