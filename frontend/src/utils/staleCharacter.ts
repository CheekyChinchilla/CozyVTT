/**
 * A character save refused because the character changed after it was loaded.
 *
 * The editors send the `updatedAt` their sheet was opened with, and the server
 * answers 409 when the character has changed since: the DM took hit points at
 * the table, say. Saving anyway would put the old values back, so the save is
 * refused and the sheet is loaded again.
 */

import { apiErrorStatus } from './errors';

export function isStaleCharacterSave(err: unknown): boolean {
  return apiErrorStatus(err) === 409;
}

/** Said on the full-page editor, which then opens the new version. */
export const STALE_CHARACTER_RELOADED =
  'This character was changed while you had it open, so your changes were not saved. It has been loaded again; make them on the new version.';

/** Said over a campaign, where the editor closes and the sheet behind it is loaded again. */
export const STALE_CHARACTER_REOPEN =
  'This character was changed while you had it open, so your changes were not saved. The sheet has been loaded again; open the editor to make them on the new version.';
