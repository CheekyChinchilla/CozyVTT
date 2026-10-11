/**
 * What to tell a player whose character sheet the server refused to save.
 *
 * The server answers with one entry for each box it refused, naming the box
 * (`inventory`, `backstory`, `spellcasting.cantrips`) and the reason. Both
 * sheet editors, the full-page editor and the editor opened from a campaign,
 * say the same thing from it, so a player over a limit knows which
 * box to shorten whichever way they opened the sheet.
 */

import type { ApiValidationIssue } from '@/utils/errors';

/** Boxes named in full. A sheet with many boxes over a limit would otherwise fill the screen with the message. */
export const REFUSED_BOXES_NAMED = 5;

/**
 * The message for a refused save: "Not saved." and each box the server named
 * with its reason, the first few in full and a count of the rest. When the
 * server named none, its own message, or the fallback when it sent none.
 */
export function refusedSaveMessage(
  issues: readonly ApiValidationIssue[],
  serverMessage: string | undefined,
  fallback: string
): string {
  if (issues.length === 0) return serverMessage || fallback;
  const named = issues.slice(0, REFUSED_BOXES_NAMED).map((issue) => `${issue.path}: ${issue.message}`);
  const more = issues.length - named.length;
  return `Not saved. ${named.join('; ')}${more > 0 ? ` and ${more} more.` : ''}`;
}
