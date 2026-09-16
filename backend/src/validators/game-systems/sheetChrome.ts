import { z } from 'zod';

/**
 * Fields the app stores on every character sheet, whatever the game system.
 *
 * `themeColor` is the header colour chosen in the editor: the name of one of
 * the editor's presets ("Classic Red") or a `#RRGGBB` colour from the custom
 * picker. It ends up inside a CSS gradient on the sheet, so nothing else is
 * accepted. An empty string means no colour was chosen.
 */
export const THEME_COLOR_PATTERN = /^(|#[0-9A-Fa-f]{6}|[A-Za-z][A-Za-z0-9 ]{0,39})$/;

export const themeColorSchema = z
  .string()
  .regex(THEME_COLOR_PATTERN, 'themeColor must be a preset name or a #RRGGBB colour')
  .optional();
