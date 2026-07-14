// ============================================
// WebSocket Context
// Manages WebSocket connection state and lifecycle
// ============================================

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
  useCallback,
  useMemo,
} from 'react';
import { useParams } from 'react-router-dom';
import socketClient from '@/services/socket';
import api from '@/services/api';

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
  const heartbeatCleanupRef = useRef<(() => void) | null>(null);
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

    try {
      await socketClient.connect(id);

      // Only update state if component is still mounted
      if (!isMountedRef.current) {
        socketClient.disconnect();
        return;
      }

      setStatus('connected');
      connectedCampaignRef.current = id;

      // Detect reconnect-to-same-campaign on the manual path (Retry button,
      // navigator.onLine handler). The .on('reconnect') listener below only
      // fires on socket.io's internal auto-reconnect; manual re-connects go
      // through here. Either way, reconnectCount must tick so consumers
      // (ChatPanel, CampaignPage) refetch missed state.
      if (previouslyConnectedCampaignRef.current === id) {
        setReconnectCount((c) => c + 1);
      }
      previouslyConnectedCampaignRef.current = id;

      // Wire up the full lifecycle on the raw socket so the status badge stays
      // in sync across drops and auto-reconnects. Previously a single
      // `.once('disconnect')` would leave the UI stuck after the first drop —
      // even though socket.io was happily reconnecting underneath, the badge
      // never flipped back to green.
      const socket = socketClient.getSocket();
      if (socket) {
        // Disconnect — flip to 'disconnected' on every drop, not just the first
        socket.on('disconnect', () => {
          if (!isMountedRef.current) return;
          setStatus('disconnected');
        });

        // Reconnect attempt (socket.io is actively retrying)
        socket.on('reconnect_attempt', () => {
          if (!isMountedRef.current) return;
          setStatus('connecting');
        });

        // Successful reconnect — flip back to 'connected' and signal consumers
        socket.on('reconnect', () => {
          if (!isMountedRef.current) return;
          setStatus('connected');
          setReconnectCount((c) => c + 1);
        });

        // Final reconnect failure (socket.io gave up)
        socket.on('reconnect_failed', () => {
          if (!isMountedRef.current) return;
          setStatus('error');
          setError('Connection lost. Click Retry to try again.');
        });
      }

      const cleanup = socketClient.startHeartbeat(30000); // 30 second interval
      heartbeatCleanupRef.current = cleanup || null;
    } catch (err: any) {
      console.error('[WebSocket] Connection failed:', err);
      if (isMountedRef.current) {
        setStatus('error');
        setError(err.message || 'Failed to connect to campaign');
        connectedCampaignRef.current = null;
      }
    }
  }, []); // No dependencies - stable reference

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    // Stop heartbeat
    if (heartbeatCleanupRef.current) {
      heartbeatCleanupRef.current();
      heartbeatCleanupRef.current = null;
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

  // Auto-connect when campaign ID changes
  useEffect(() => {
    if (campaignId && connectedCampaignRef.current !== campaignId) {
      connect(campaignId);
    }

    // Cleanup on unmount or campaign change
    return () => {
      if (heartbeatCleanupRef.current) {
        heartbeatCleanupRef.current();
        heartbeatCleanupRef.current = null;
      }

      socketClient.disconnect();
      setStatus('disconnected'); // Reset status so reconnect can work
      setError(null);
      connectedCampaignRef.current = null;
      // Reset reconnect-detection so navigating to a new campaign doesn't
      // trigger a false-positive resync when the new campaign first connects.
      previouslyConnectedCampaignRef.current = null;
    };
  }, [campaignId]); // connect is stable - no need in deps (causes premature cleanup)

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
      if (statusRef.current === 'connected' || statusRef.current === 'connecting') return;

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
            console.error('[WebSocket] Auto-reconnect on online event failed:', err);
          });
        }
      }, 300);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // If the page loads while offline, immediately reflect that.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('disconnected');
    }

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
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

    const KEEPALIVE_INTERVAL = 10 * 60 * 1000; // 10 minutes
    const intervalId = setInterval(async () => {
      try {
        await api.pingSession();
      } catch {
        // Silently ignore — if the session is truly dead the next page interaction will redirect to login
      }
    }, KEEPALIVE_INTERVAL);

    return () => clearInterval(intervalId);
  }, [status]);

  // Context value — memoized so consumers only re-render on actual state
  // changes, not on every provider render.
  const value: WebSocketContextState = useMemo(() => ({
    status,
    error,
    reconnectCount,
    socket: socketClient,
    connect,
    disconnect,
    reconnect,
  }), [status, error, reconnectCount, connect, disconnect, reconnect]);

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
