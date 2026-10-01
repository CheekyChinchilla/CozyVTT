import { useEffect, useState } from 'react';
import { holdUnsavedWork, isSignedOut, subscribeSignedOut } from '@/services/unsavedWork';

/**
 * Keeps the page where it is while an editor has unsaved changes, so a lost
 * session cannot take them with it (see services/unsavedWork). Answers whether
 * the browser has been signed out meanwhile.
 */
export function useUnsavedWorkGuard(hasUnsavedChanges: boolean): boolean {
  const [signedOut, setSignedOut] = useState(isSignedOut);

  useEffect(() => subscribeSignedOut(setSignedOut), []);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    return holdUnsavedWork();
  }, [hasUnsavedChanges]);

  return signedOut;
}
