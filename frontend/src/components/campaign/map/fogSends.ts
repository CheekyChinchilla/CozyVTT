// ============================================
// What the GM's fog box and a viewer's explored ground send the server, in
// parts it takes. The live table reads no message longer than
// MAX_SOCKET_MESSAGE_BYTES, which a box of more than about 142,000 squares
// passes, and refuses a report of explored ground naming more than
// MAX_EXPLORATION_REPORT_CELLS squares whole.
//
// Pure: no React, no socket.
// ============================================

import type { FogOperation, FogState } from '@/types/walls';
import { MAX_EXPLORATION_REPORT_CELLS, MAX_SOCKET_MESSAGE_BYTES } from '@/constants/mapLimits';
import { fogCellsInRect, type FogRect } from './fogSelection';

/**
 * Room in a message for what goes around its list of squares: the event's
 * name, the map's id and the operation's own fields, a few dozen bytes.
 */
const ENVELOPE_BYTES = 1024;

/** The most bytes the list of squares in one message may take. */
export const CELL_LIST_BYTES = MAX_SOCKET_MESSAGE_BYTES - ENVELOPE_BYTES;

/**
 * Squares cut into runs, in order, each written as a list within `bytes`:
 * each square takes its digits and the comma after it. A run holds at least
 * one square.
 */
export function cellsInParts(cells: readonly number[], bytes: number): number[][] {
  const parts: number[][] = [];
  let part: number[] = [];
  let used = 0;
  for (const cell of cells) {
    const size = String(cell).length + 1;
    if (part.length > 0 && used + size > bytes) {
      parts.push(part);
      part = [];
      used = 0;
    }
    part.push(cell);
    used += size;
  }
  if (part.length > 0) parts.push(part);
  return parts;
}

/**
 * The operations a fog box sends: reveal_all or hide_all for a box over the
 * whole map, and otherwise its squares, in as many operations as it takes
 * for each to be a message the live table reads.
 */
export function fogOperationsForBox(fog: FogState, rect: FogRect, reveal: boolean): FogOperation[] {
  const wholeMap = rect.colMin === 0 && rect.rowMin === 0
    && rect.colMax === fog.fogCols - 1 && rect.rowMax === fog.fogRows - 1;
  if (wholeMap) return [{ op: reveal ? 'reveal_all' : 'hide_all' }];
  const op = reveal ? 'reveal' : 'hide';
  return cellsInParts(fogCellsInRect(fog, rect), CELL_LIST_BYTES).map((cells) => ({ op, cells }));
}

/** Newly explored squares, in reports of at most MAX_EXPLORATION_REPORT_CELLS each, in order. */
export function explorationReports(cells: readonly number[]): number[][] {
  const reports: number[][] = [];
  for (let start = 0; start < cells.length; start += MAX_EXPLORATION_REPORT_CELLS) {
    reports.push(cells.slice(start, start + MAX_EXPLORATION_REPORT_CELLS));
  }
  return reports;
}
