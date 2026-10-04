import { z } from 'zod';
import { THEME_COLOR_PATTERN } from '../../utils/styleAllowlists';

/**
 * Fields the app stores on every character sheet, whatever the game system.
 *
 * `themeColor` is the header colour chosen in the editor: the name of one of
 * the editor's presets ("Classic Red") or a `#RRGGBB` colour from the custom
 * picker. It ends up inside a CSS gradient on the sheet, so the pattern the
 * sheets re-check at render is the one enforced here.
 */

export const themeColorSchema = z
  .string()
  .regex(THEME_COLOR_PATTERN, 'themeColor must be a preset name or a #RRGGBB colour')
  .optional();
