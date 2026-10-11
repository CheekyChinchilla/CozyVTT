/**
 * Allies and organizations, on a D&D 5e or Pathfinder 2e sheet.
 *
 * Declared once and imported by both schemas, so the two cannot end up with
 * different limits on the same box.
 */

import { z } from 'zod';
import { sheetLongTextSchema } from './sheetText';

/**
 * Both boxes are optional so a quick entry saves.
 *
 * The name takes a paragraph: a sheet written before 1.3.0 kept its allies in
 * one free-text field, and moving it here puts the whole of it in the name, so
 * a one-line limit would make that sheet impossible to save.
 */
export const alliesAndOrganizationsSchema = z.object({
  name: sheetLongTextSchema.optional(),
  description: sheetLongTextSchema.optional(),
});
