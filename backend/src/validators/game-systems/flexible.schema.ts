/**
 * Flexible sheet Zod schema.
 *
 * A Flexible character (no game system) is a list of sections the player lays
 * out themselves. Each section's `type` decides the list its page reads:
 * `fields` for stats, `items` for a list, `value` for text, `columns` and
 * `rows` for a table. A section missing that list, or a cell holding an
 * object, used to be stored as sent and broke the page of everyone who opened
 * the sheet.
 *
 * Keys beside `sections` are kept as they are: an import or a program using
 * the API may store its own there, and the editor sends them back with every
 * save. Nothing on the page reads them.
 */

import { z } from 'zod';
import {
  FLEXIBLE_MAX_COLUMNS,
  FLEXIBLE_MAX_FIELDS,
  FLEXIBLE_MAX_ROWS,
  FLEXIBLE_MAX_SECTIONS,
  SHEET_ID_MAX,
  SHEET_LONG_TEXT_MAX,
  SHEET_NAME_MAX,
  SHEET_SHORT_TEXT_MAX,
} from './sheetLimits';

/** A column width as the editor writes it, such as "33.333333333333336%". */
const COLUMN_WIDTH_MAX = 40;

const id = z.string().min(1).max(SHEET_ID_MAX);
const name = z.string().max(SHEET_NAME_MAX);

const sectionBase = {
  id,
  title: name,
  collapsed: z.boolean().optional(),
};

const statsSectionSchema = z.object({
  ...sectionBase,
  type: z.literal('stats'),
  fields: z
    .array(
      z.object({
        id,
        name,
        value: z.number(),
        modifier: z.number().optional(),
      })
    )
    .max(FLEXIBLE_MAX_FIELDS),
});

const listSectionSchema = z.object({
  ...sectionBase,
  type: z.literal('list'),
  items: z
    .array(
      z.object({
        id,
        text: z.string().max(SHEET_SHORT_TEXT_MAX),
        checked: z.boolean().optional(),
      })
    )
    .max(FLEXIBLE_MAX_ROWS),
});

const textSectionSchema = z.object({
  ...sectionBase,
  type: z.literal('text'),
  value: z.string().max(SHEET_LONG_TEXT_MAX),
});

const tableSectionSchema = z.object({
  ...sectionBase,
  type: z.literal('table'),
  columns: z
    .array(
      z.object({
        id,
        name,
        width: z.string().max(COLUMN_WIDTH_MAX).optional(),
      })
    )
    .max(FLEXIBLE_MAX_COLUMNS),
  rows: z
    .array(
      z.object({
        id,
        // Keyed by column id. Removing a column removes its cells, so a row
        // holds at most one per column; twice that allows for anything left
        // over from before.
        cells: z
          .record(id, z.string().max(SHEET_SHORT_TEXT_MAX))
          .refine((cells) => Object.keys(cells).length <= FLEXIBLE_MAX_COLUMNS * 2, {
            message: `A row can have at most ${FLEXIBLE_MAX_COLUMNS * 2} cells`,
          }),
      })
    )
    .max(FLEXIBLE_MAX_ROWS),
});

export const flexibleSectionSchema = z.discriminatedUnion('type', [
  statsSectionSchema,
  listSectionSchema,
  textSectionSchema,
  tableSectionSchema,
]);

export const flexibleCharacterDataSchema = z.looseObject({
  sections: z.array(flexibleSectionSchema).max(FLEXIBLE_MAX_SECTIONS).optional(),
});

export type FlexibleCharacterData = z.infer<typeof flexibleCharacterDataSchema>;
