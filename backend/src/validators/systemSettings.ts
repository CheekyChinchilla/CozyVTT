/**
 * The body of PUT /api/admin/settings. Every field is optional, and a field
 * left out keeps its stored value. Fields this does not name are ignored,
 * `timezone` among them: it is still stored, but nothing used it.
 *
 * The theme is painted for every visitor, the sign-in page included, so the
 * theme, font and custom colours are checked against the same lists and
 * format as a user's own preferences (validators/appearance.ts). The
 * branding paths are checked by the route, which has the message for them.
 */

import { z } from 'zod';
import { THEME_IDS, FONT_IDS, CustomThemeColorsSchema } from './appearance';

export const UpdateSystemSettingsSchema = z.object({
  instanceName: z.string().optional(),
  allowRegistration: z.boolean().optional(),
  requireAdminApproval: z.boolean().optional(),
  themeId: z.enum(THEME_IDS).optional(),
  fontId: z.enum(FONT_IDS).optional(),
  /** null clears the custom colours. */
  customThemeColors: CustomThemeColorsSchema.nullable().optional(),
  customLogoUrl: z.string().nullable().optional(),
  customFaviconUrl: z.string().nullable().optional(),
  customMascotUrl: z.string().nullable().optional(),
});

export type UpdateSystemSettingsInput = z.infer<typeof UpdateSystemSettingsSchema>;
