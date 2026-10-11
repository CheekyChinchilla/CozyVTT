/**
 * User Preferences validator
 *
 * Per-user theme/font/UX preferences stored in `User.preferences` JSON column.
 */

import { z } from 'zod';
import { THEME_IDS, FONT_IDS, CustomThemeColorsSchema } from './appearance';

/**
 * Full preferences schema. All fields optional so the same shape can be used
 * for partial-merge PATCH-style updates. `.strip()` discards any unknown keys
 * silently — clients can't smuggle extra fields into the JSON column.
 */
export const UserPreferencesSchema = z.object({
  themeId: z.enum(THEME_IDS).optional(),
  customThemeColors: CustomThemeColorsSchema.nullable().optional(),
  fontId: z.enum(FONT_IDS).optional(),
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
