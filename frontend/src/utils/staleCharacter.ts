/**
 * A character save refused because the character changed after it was loaded.
 *
 * The editors send the `updatedAt` their sheet was opened with, and the server
 * answers 409 when the character has changed since: the DM took hit points at
 * the table, say. Saving anyway would put the old values back, so the save is
 * refused, and the editor carries the user's changes onto the newest version
 * for them to confirm (components/character/StaleSaveDialog).
 */

import { apiErrorStatus } from './errors';

export function isStaleCharacterSave(err: unknown): boolean {
  return apiErrorStatus(err) === 409;
}
