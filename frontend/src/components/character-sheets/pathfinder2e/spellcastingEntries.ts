/**
 * Pathfinder 2e spellcasting as the editor reads it from a stored sheet.
 *
 * Kept apart from the editor so each shape can be typed against the sheet's
 * own interfaces, which follow the server's schema: an entry built here that
 * misses a field the server requires fails to compile.
 */

import type { PF2eSpellSlots } from '@/types/game-systems';

/** The slot ranks the schema requires, 1 to 10. */
export const PF2E_SLOT_RANKS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * All ten slot ranks, from whatever the sheet stored.
 *
 * How many slots of a rank are used is `expended`. The 1.4.0 editor wrote it
 * as `used`, which the server now drops on save, so a stored `used` is taken
 * whenever `expended` is 0 or missing: a count recorded then survives the first
 * save on this version. A rank the sheet lacks starts at none.
 */
export function readPf2eSpellSlots(stored: unknown): PF2eSpellSlots {
  const source = asRecord(stored);
  const entries = PF2E_SLOT_RANKS.map((rank) => {
    const slot = asRecord(source[rank]);
    return [rank, { total: count(slot.total), expended: count(slot.expended) || count(slot.used) }] as const;
  });
  return Object.fromEntries(entries) as unknown as PF2eSpellSlots;
}
