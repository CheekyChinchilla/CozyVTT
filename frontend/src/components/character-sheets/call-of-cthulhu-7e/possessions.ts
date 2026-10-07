/**
 * The Call of Cthulhu possessions box: one item per line, written
 * "Item Name - Notes".
 */

import type { CoC7ePossession } from '@/types/game-systems';

/**
 * The possessions a box says. A line is split at its first " - " only, since
 * the notes may hold one too ("sharp - old"). Blank lines are dropped and each
 * part is trimmed.
 */
export function parsePossessions(text: string): CoC7ePossession[] {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const at = line.indexOf(' - ');
      return at > 0
        ? { name: line.slice(0, at).trim(), notes: line.slice(at + 3).trim() }
        : { name: line.trim(), notes: '' };
    });
}

/** The box's text for a list of possessions; an item with no notes has no " - ". */
export function formatPossessions(items: readonly CoC7ePossession[]): string {
  return items.map((item) => `${item.name}${item.notes ? ` - ${item.notes}` : ''}`).join('\n');
}
