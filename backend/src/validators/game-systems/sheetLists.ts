/**
 * Lists shared by every typed system's sheet schema, each held to its limit in
 * sheetLimits.ts.
 */

import { z } from 'zod';
import { SHEET_LIST_MAX } from './sheetLimits';

/**
 * A list on a sheet: inventory, attacks, spells, features, conditions. The
 * message is what a player whose list is over the limit is told, beside the
 * name of the list.
 */
export function sheetList<T extends z.ZodType>(entry: T, max: number = SHEET_LIST_MAX) {
  return z.array(entry).max(max, `Can hold at most ${max.toLocaleString('en-US')} entries`);
}
