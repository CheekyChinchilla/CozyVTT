import { useEffect, useState } from 'react';
import { holdUnsavedWork, isSignedOut, subscribeSignedOut } from '@/services/unsavedWork';
import { keepSessionAlive, SESSION_KEEPALIVE_MS } from '@/services/sessionKeepAlive';

/**
 * While an editor has unsaved changes, keeps the session from running out
 * and keeps the page where it is if it is lost anyway, so the changes are not
 * taken with it (see services/unsavedWork). Answers whether the browser has
 * been signed out meanwhile.
 */
export function useUnsavedWorkGuard(hasUnsavedChanges: boolean): boolean {
  const [signedOut, setSignedOut] = useState(isSignedOut);

  useEffect(() => subscribeSignedOut(setSignedOut), []);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const release = holdUnsavedWork();
    // At once as well: the sheet may have sat open for most of the hour.
    void keepSessionAlive();
    const intervalId = setInterval(() => void keepSessionAlive(), SESSION_KEEPALIVE_MS);
    return () => {
      clearInterval(intervalId);
      release();
    };
  }, [hasUnsavedChanges]);

  return signedOut;
}
