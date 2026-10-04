/**
 * A character save refused because the browser is no longer signed in.
 *
 * While an editor holds unsaved changes the page stays put on a 401 (see
 * services/unsavedWork), so the editor says what happened. Signing in again
 * in another tab shares the session with this one, and Save then works.
 */

import { apiErrorStatus } from './errors';

export function isSignedOutSave(err: unknown): boolean {
  return apiErrorStatus(err) === 401;
}

export const SIGNED_OUT_NOT_SAVED =
  "Not saved: you've been signed out. Sign in again in a new tab, then press Save.";
