import { useEffect, useState } from 'react';
import { checkLiveConnection, type LiveConnectionState } from '@/services/liveConnectionCheck';

/**
 * Check this browser's live connection when the component appears and each
 * time `run` changes, from 1 (0 waits); 'checking' until the answer. A check
 * still under way is closed when `run` changes or the component goes.
 */
export function useLiveConnectionCheck(run: number): LiveConnectionState | 'checking' {
  const [found, setFound] = useState<{ run: number; state: LiveConnectionState } | null>(null);

  useEffect(() => {
    if (run === 0) return;
    return checkLiveConnection((state) => setFound({ run, state }));
  }, [run]);

  return found?.run === run ? found.state : 'checking';
}
