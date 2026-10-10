/**
 * Text fields shared by every system's sheet schema, each held to its limit
 * in sheetLimits.ts.
 */

import { z } from 'zod';
import { SHEET_LONG_TEXT_MAX, SHEET_NAME_MAX, SHEET_SHORT_TEXT_MAX } from './sheetLimits';

/**
 * The character's own name on the sheet (`characterName`, or
 * `investigatorName` in Call of Cthulhu). Saving a sheet copies it into the
 * character's name column, so it has that column's limit.
 */
export const sheetCharacterNameSchema = z
  .string()
  .min(1)
  .max(SHEET_NAME_MAX, `A character's name can be at most ${SHEET_NAME_MAX} characters`);

/**
 * Any other one-line box on a sheet: a class, a damage roll, an item's name,
 * one entry of a list.
 */
export const sheetShortTextSchema = z
  .string()
  .max(SHEET_SHORT_TEXT_MAX, `Can be at most ${SHEET_SHORT_TEXT_MAX.toLocaleString('en-US')} characters`);

/**
 * A box that holds paragraphs: notes, a description, a backstory. Also any
 * field an older sheet may have used for a paragraph, so a sheet saved before
 * the limits existed can still be saved.
 */
export const sheetLongTextSchema = z
  .string()
  .max(SHEET_LONG_TEXT_MAX, `Can be at most ${SHEET_LONG_TEXT_MAX.toLocaleString('en-US')} characters`);
