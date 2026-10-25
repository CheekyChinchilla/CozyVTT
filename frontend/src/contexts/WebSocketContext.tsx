// ============================================
// WebSocket Context
// Manages WebSocket connection state and lifecycle
// ============================================

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useEffectEvent,
  useRef,
  ReactNode,
  useCallback,
  useMemo,
} from 'react';
import { useParams } from 'react-router';
import type { Socket } from 'socket.io-client';
import socketClient from '@/services/socket';
import { errorMessage, errorSummary } from '@/utils/errors';
import { keepSessionAlive, SESSION_KEEPALIVE_MS } from '@/services/sessionKeepAlive';
import type { AccessRevoked } from '@/types';

// ============================================
// Types
// ============================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface WebSocketContextState {
  // Connection State
  status: ConnectionStatus;
  error: string | null;

  /**
   * Monotonically increasing counter that ticks every time the WebSocket
   * successfully reconnects after a drop (does NOT tick on initial connect).
   * Consumers like ChatPanel watch this to know they should refetch missed
   * state from REST. Compare across renders — if it changed, a reconnect
   * just happened.
   */
  reconnectCount: number;

  /**
   * 0 until this connection has authenticated into the campaign, then a new
   * number on each re-authentication.
   *
   * Distinct from `reconnectCount`, which ticks when the transport comes back:
   * that is a moment before the campaign has been rejoined, and the server
   * drops anything sent by a socket it has not authenticated. Anything that
   * asks the server for state on joining watches this instead.
   */
  joinedEpoch: number;

  // Socket Instance (for components that need direct access)
  socket: typeof socketClient;

  // Connection Controls
  connect: (campaignId: string) => Promise<void>;
  disconnect: () => void;
  reconnect: () => Promise<void>;
}

// ============================================
// Context Creation
// ============================================

const WebSocketContext = createContext<WebSocketContextState | undefined>(
  undefined
);

// ============================================
// Provider Component
// ============================================

interface WebSocketProviderProps {
  children: ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { id: campaignId } = useParams<{ id: string }>();

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [joinedEpoch, setJoinedEpoch] = useState(0);
  const connectedCampaignRef = useRef<string | null>(null);
  const statusRef = useRef<ConnectionStatus>('disconnected');
  const isMountedRef = useRef(true);
  /**
   * Tracks the campaignId of the most recent successful connection. Used to
   * detect "this connect() call is a reconnect, not a first-time connect" so
   * we can fire reconnectCount on the manual-Retry path (which destroys and
   * recreates the socket, throwing away the .on('reconnect') listener).
   *
   * Reset only on full disconnect (campaign change / unmount), NOT on
   * transient drops, so a reconnect-to-same-campaign sees the previous value
   * and triggers a refetch.
   */
  const previouslyConnectedCampaignRef = useRef<string | null>(null);
  /**
   * The server said this connection may no longer use its campaign
   * (`campaign.access.revoked`). The badge then keeps the error, with the
   * reason, through the disconnect that may follow; the page itself says
   * why and leaves (useAccessRevoked).
   */
  const revokedRef = useRef(false);
  /** Sockets the lifecycle listeners are on, so none gets them twice. */
  const followedRef = useRef(new WeakSet<Socket>());
  /** A connect to try again, after one that left no socket behind failed. */
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failedConnectsRef = useRef(0);

  // Keep statusRef in sync with status state
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Every successful join of the campaign, the first and each one after a
  // drop. Registered through the client's own listener table, which re-attaches
  // to the socket it builds on reconnect, so this survives the socket being
  // thrown away and replaced.
  //
  // Joining is what makes the connection work, whichever socket did it: one
  // socket.io got through on its own retry after the connect that built it
  // had failed left the badge on Connection Error over a working table.
  useEffect(() => {
    const onJoined = () => {
      setJoinedEpoch((n) => n + 1);
      if (!isMountedRef.current || revokedRef.current) return;
      setStatus('connected');
      setError(null);
    };
    socketClient.on('authenticated', onJoined);
    return () => { socketClient.off('authenticated', onJoined); };
  }, []);

  // The table has ended for this connection: removed, the campaign deleted,
  // or the sign-in ended. A removed member's connection stays open, so
  // without this the badge kept saying Connected.
  useEffect(() => {
    const onRevoked = (revoked: AccessRevoked) => {
      if (!isMountedRef.current) return;
      revokedRef.current = true;
      setStatus('error');
      setError(revoked.message);
    };
    socketClient.on('campaign.access.revoked', onRevoked);
    return () => { socketClient.off('campaign.access.revoked', onRevoked); };
  }, []);

  // Wire up the full lifecycle on the raw socket so the status badge stays
  // in sync across drops and auto-reconnects. Run for every socket the page
  // uses: the one connect() is handed and each one the client builds itself.
  const attachLifecycle = useCallback((socket: Socket) => {
    if (followedRef.current.has(socket)) return;
    followedRef.current.add(socket);
    // Flip to 'disconnected' on every drop, not only the first: a single
    // `.once('disconnect')` left the badge stuck after the first drop while
    // socket.io reconnected underneath.
    socket.on('disconnect', () => {
      if (!isMountedRef.current || revokedRef.current) return;
      setStatus('disconnected');
    });

    // The reconnect lifecycle belongs to the Manager (`socket.io`), not the
    // Socket: socket.io-client v4 never emits `reconnect_attempt`,
    // `reconnect` or `reconnect_failed` on the Socket itself. Listening
    // there left the badge on "disconnected" after every automatic
    // reconnect, and everything keyed on `status` returning to
    // 'connected' waited for an event that never came.
    const manager = socket.io;

    // Reconnect attempt (socket.io is actively retrying)
    manager.on('reconnect_attempt', () => {
      if (!isMountedRef.current) return;
      setStatus('connecting');
    });

    // Successful reconnect — flip back to 'connected' and signal consumers
    manager.on('reconnect', () => {
      if (!isMountedRef.current) return;
      setStatus('connected');
      setReconnectCount((c) => c + 1);
    });

    // Final reconnect failure. socket.io now retries for as long as it
    // takes, so this is only a safety net.
    manager.on('reconnect_failed', () => {
      if (!isMountedRef.current) return;
      setStatus('error');
      setError('Connection lost. Click Retry to try again.');
    });
  }, []);

  // After the server closes a socket the client builds a new one itself. The
  // listeners above stay on the one it threw away, so the badge said
  // "Disconnected" over a working connection and nothing keyed on the status
  // or the reconnect count ran again.
  // Every socket the client builds is followed from the start, before it
  // has connected: socket.io retries a socket whose first connect failed,
  // and the badge has to follow that retry too.
  useEffect(() => socketClient.onCreated(attachLifecycle), [attachLifecycle]);

  useEffect(() => socketClient.onRebuilt(() => {
    if (!isMountedRef.current) return;
    setStatus('connected');
    setError(null);
    setReconnectCount((c) => c + 1);
    const socket = socketClient.getSocket();
    if (socket) attachLifecycle(socket);
  }), [attachLifecycle]);

  // Connect to WebSocket
  const connect = useCallback(async (id: string) => {
    // Use ref to check status without creating a dependency
    if (statusRef.current === 'connecting') {
      return;
    }

    if (connectedCampaignRef.current === id && statusRef.current === 'connected') {
      return;
    }

    setStatus('connecting');
    setError(null);
    revokedRef.current = false;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    try {
      await socketClient.connect(id);
      failedConnectsRef.current = 0;

      // Only update state if component is still mounted
      if (!isMountedRef.current) {
        socketClient.disconnect();
        return;
      }

      setStatus('connected');
      connectedCampaignRef.current = id;

      // Detect reconnect-to-same-campaign on the manual path (Retry button,
      // navigator.onLine handler). The Manager's 'reconnect' listener in
      // attachLifecycle only fires on socket.io's internal auto-reconnect;
      // manual re-connects go through here. Either way, reconnectCount must tick so consumers
      // (ChatPanel, CampaignPage) refetch missed state.
      if (previouslyConnectedCampaignRef.current === id) {
        setReconnectCount((c) => c + 1);
      }
      previouslyConnectedCampaignRef.current = id;

      const socket = socketClient.getSocket();
      if (socket) attachLifecycle(socket);
    } catch (err) {
      // A socket whose connect failed is often still being retried by
      // socket.io, and its lifecycle is already followed (onCreated), so the
      // badge moves on by itself when it gets through.
      console.error('[WebSocket] Connection failed:', errorMessage(err));
      if (isMountedRef.current) {
        setStatus('error');
        setError(errorMessage(err) || 'Failed to connect to campaign');
        connectedCampaignRef.current = null;
        // A connect that got no answer at all leaves no socket to retry:
        // try again, waiting longer each time up to 30 seconds.
        if (!revokedRef.current && !socketClient.getSocket()) {
          const delay = Math.min(2000 * 2 ** failedConnectsRef.current, 30_000);
          failedConnectsRef.current += 1;
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            if (isMountedRef.current) void connectRef.current(id);
          }, delay);
        }
      }
    }
  }, [attachLifecycle]);
  // The retry above calls the latest connect, which is declared by this very callback.
  const connectRef = useRef(connect);
  connectRef.current = connect;

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    socketClient.disconnect();
    setStatus('disconnected');
    setError(null);
    connectedCampaignRef.current = null;
  }, []); // No dependencies needed with ref

  // Reconnect (disconnect then connect)
  const reconnect = useCallback(async () => {
    if (!campaignId) {
      return;
    }

    disconnect();

    // Wait a brief moment before reconnecting
    await new Promise(resolve => setTimeout(resolve, 500));

    await connect(campaignId);
  }, [campaignId, disconnect, connect]);

  // Auto-connect when campaign ID changes. connect is called as an effect
  // event: as a dependency, its every change would run the cleanup below and
  // drop the connection.
  const connectTo = useEffectEvent((id: string) => connect(id));
  useEffect(() => {
    if (campaignId && connectedCampaignRef.current !== campaignId) {
      connectTo(campaignId);
    }

    // Cleanup on unmount or campaign change
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      failedConnectsRef.current = 0;

      socketClient.disconnect();
      setStatus('disconnected'); // Reset status so reconnect can work
      setError(null);
      connectedCampaignRef.current = null;
      // Reset reconnect-detection so navigating to a new campaign doesn't
      // trigger a false-positive resync when the new campaign first connects.
      previouslyConnectedCampaignRef.current = null;
      // Likewise the join count: the next campaign's first join is not a rejoin.
      setJoinedEpoch(0);
    };
  }, [campaignId]);

  // Browser network listeners — flip status immediately when the OS reports
  // the network has gone away, and actively trigger reconnection when it
  // comes back. Without this, dev-tools "Offline" mode (and laptop-lid-closed
  // scenarios) keep the underlying WebSocket "open" from socket.io's
  // perspective — no traffic flows but no disconnect event fires either, so
  // socket.io won't auto-reconnect when traffic resumes because it doesn't
  // know it ever lost the connection.
  useEffect(() => {
    const handleOffline = () => {
      // Capture the campaign for restoration before clearing state.
      const cid = connectedCampaignRef.current;
      if (!cid) return;

      setStatus('disconnected');

      // Force the socket into a disconnected state so socket.io knows we're
      // offline. socket.disconnect() prevents socket.io's own auto-reconnect
      // (because it's flagged as client-initiated) — that's intentional. We
      // own the reconnect in handleOnline below, so the lifecycle is one path
      // not two.
      const socket = socketClient.getSocket();
      if (socket?.connected) {
        socket.disconnect();
      }
    };

    const handleOnline = () => {
      const cid = connectedCampaignRef.current ?? previouslyConnectedCampaignRef.current;
      if (!cid) return;
      if (revokedRef.current) return;
      if (statusRef.current === 'connected') return;
      // 'connecting' is either our own connect in flight, which will finish,
      // or socket.io retrying by itself, whose remaining attempts may already
      // be spent against a network that has only now come back. Only the
      // first is left alone.
      if (statusRef.current === 'connecting' && socketClient.isConnectInProgress()) return;

      // Full disconnect + reconnect dance. Goes through our connect() flow
      // which handles the auth/reauth handshake and ticks reconnectCount
      // (via the previouslyConnectedCampaignRef match) so consumers refetch
      // missed state.
      setStatus('connecting');
      disconnect();
      // Brief delay so the disconnect propagates before we open a new socket.
      setTimeout(() => {
        if (isMountedRef.current) {
          connect(cid).catch((err) => {
            console.error('[WebSocket] Auto-reconnect on online event failed:', errorSummary(err));
          });
        }
      }, 300);
    };

    // A page shown again (a phone's screen back on, a tab brought forward, a
    // page restored from the back-forward cache) may have lost its
    // connection while hidden, where retries are slowed or stopped:
    // reconnect at once instead of waiting for the next retry.
    const handleVisible = () => {
      if (document.visibilityState === 'visible') handleOnline();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('pageshow', handleOnline);

    // If the page loads while offline, immediately reflect that.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('disconnected');
    }

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('pageshow', handleOnline);
    };
    // connect/disconnect are stable (useCallback with []) — including them
    // satisfies exhaustive-deps without causing reruns.
  }, [connect, disconnect]);

  // Session keepalive — prevents the 1-hour rolling session from expiring mid-game.
  // WebSocket traffic does not touch the Express session middleware, so without this
  // a player who stays connected purely via WebSocket would be logged out after 1 hour
  // of no HTTP activity, even while actively playing.
  useEffect(() => {
    if (status !== 'connected') return;
    const intervalId = setInterval(() => void keepSessionAlive(), SESSION_KEEPALIVE_MS);
    return () => clearInterval(intervalId);
  }, [status]);

  // Context value — memoized so consumers only re-render on actual state
  // changes, not on every provider render.
  const value: WebSocketContextState = useMemo(() => ({
    status,
    error,
    reconnectCount,
    joinedEpoch,
    socket: socketClient,
    connect,
    disconnect,
    reconnect,
  }), [status, error, reconnectCount, joinedEpoch, connect, disconnect, reconnect]);

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

// ============================================
// Hook for consuming context
// ============================================

export function useWebSocket() {
  const context = useContext(WebSocketContext);

  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }

  return context;
}

/**
 * The websocket context if there is one, otherwise undefined.
 *
 * The provider only wraps the campaign screens, so a component that can also be
 * rendered outside one — the character sheet viewer, which opens both from the
 * campaign roster and from the character gallery — cannot use `useWebSocket`
 * without crashing in the second case. Live updates are a bonus there, not a
 * requirement, so this lets such a component degrade instead of throwing.
 */
export function useOptionalWebSocket() {
  return useContext(WebSocketContext);
}
