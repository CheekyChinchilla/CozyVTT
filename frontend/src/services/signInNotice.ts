/**
 * Why the sign-in page was opened, when the server said: a sentence carried
 * across the full page load that takes a lost sign-in there, and shown once.
 *
 * Kept in sessionStorage, which belongs to this tab. Storage can be refused
 * (a private window, blocked site data); the notice is then lost and the
 * sign-in page simply says nothing, as it did before.
 */

const KEY = 'cozyvtt.signInNotice';

/** Remember `message` for the sign-in page this tab opens next. */
export function rememberSignInNotice(message: string): void {
  try {
    sessionStorage.setItem(KEY, message);
  } catch {
    // Storage refused: the sign-in page goes without the reason.
  }
}

/** The remembered sentence, if any. */
export function readSignInNotice(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Forget the remembered sentence, once the sign-in page has shown it. */
export function forgetSignInNotice(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing was kept.
  }
}
