import { useEffect, useRef } from 'react';

/**
 * Run `catchUp` each time the connection joins the campaign again after its
 * first join. Keyed on the join (WebSocketContext's joinedEpoch), not on the
 * transport reconnecting: a read made before the socket is back in the
 * campaign's room can miss an event sent in between, a pause for instance,
 * and no later event corrects it.
 */
export function useOnRejoin(joinedEpoch: number, catchUp: () => void): void {
  const latest = useRef(catchUp);
  latest.current = catchUp;
  useEffect(() => {
    if (joinedEpoch > 1) latest.current();
  }, [joinedEpoch]);
}
