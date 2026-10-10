/**
 * Text fields shared by every system's sheet schema, each held to its limit
 * in sheetLimits.ts.
 */

import { z } from 'zod';
import { SHEET_NAME_MAX } from './sheetLimits';

/**
 * The character's own name on the sheet (`characterName`, or
 * `investigatorName` in Call of Cthulhu). Saving a sheet copies it into the
 * character's name column, so it has that column's limit.
 */
export const sheetCharacterNameSchema = z
  .string()
  .min(1)
  .max(SHEET_NAME_MAX, `A character's name can be at most ${SHEET_NAME_MAX} characters`);
