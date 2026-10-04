/**
 * Unsaved changes on screen, and whether the server has signed this browser
 * out while they were there.
 *
 * A request refused for want of a session sends the page to sign-in, which
 * throws away whatever an editor holds. While any editor holds unsaved
 * changes the page stays where it is instead: the request still fails, and
 * the editors say the browser was signed out, so the changes can be saved
 * once it signs in again (in another tab; the session cookie is shared).
 */

import { isPublicPath } from '@/utils/publicRoutes';

let holders = 0;
let signedOut = false;
const listeners = new Set<(signedOut: boolean) => void>();

function setSignedOut(value: boolean): void {
  if (signedOut === value) return;
  signedOut = value;
  listeners.forEach((listener) => listener(value));
}

/** Held while an editor has unsaved changes. Returns the release. */
export function holdUnsavedWork(): () => void {
  holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    // Nothing left to protect, so a later refusal goes to sign-in as usual.
    if (holders === 0) setSignedOut(false);
  };
}

export function hasUnsavedWork(): boolean {
  return holders > 0;
}

export function isSignedOut(): boolean {
  return signedOut;
}

/**
 * A save was refused for want of a session. Marks the browser signed out, as
 * long as there are unsaved changes to keep. The API client's 401 handling
 * does this for every request; an editor whose save was refused says so too,
 * so it does not depend on how that request was made.
 */
export function reportSignedOut(): void {
  if (hasUnsavedWork()) setSignedOut(true);
}

/** A request that needs a session has succeeded, so the browser is signed in. */
export function reportSignedIn(): void {
  setSignedOut(false);
}

export function subscribeSignedOut(listener: (signedOut: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What a 401 on this page does. */
export function handleUnauthorized(pathname: string, goToSignIn: () => void): void {
  // Expected on a page anyone may open: nobody has signed in yet.
  if (isPublicPath(pathname)) return;
  if (hasUnsavedWork()) {
    reportSignedOut();
    return;
  }
  goToSignIn();
}
