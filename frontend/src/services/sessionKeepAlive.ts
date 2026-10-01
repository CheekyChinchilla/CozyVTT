/**
 * Keeping a session from running out while it is in use.
 *
 * A session ends after an hour with no requests. Some activity makes none:
 * play over the live connection, and typing into a character sheet. Those
 * places ping the session instead, which starts its hour again.
 */

import api from '@/services/api';
import { reportSignedIn } from '@/services/unsavedWork';

/** Well inside the hour, so a late timer still lands in time. */
export const SESSION_KEEPALIVE_MS = 10 * 60 * 1000;

/** Pings closer together than this are skipped; one already started the hour again. */
const MIN_PING_GAP_MS = 60 * 1000;

let lastPingAt = Number.NEGATIVE_INFINITY;

export async function keepSessionAlive(): Promise<void> {
  const now = Date.now();
  if (now - lastPingAt < MIN_PING_GAP_MS) return;
  lastPingAt = now;
  try {
    await api.pingSession();
    reportSignedIn();
  } catch {
    // A 401 is handled by the API client: to sign-in, or, while an editor
    // holds unsaved changes, the signed-out notice. Anything else, such as a
    // dropped connection, is tried again on the next ping.
  }
}
