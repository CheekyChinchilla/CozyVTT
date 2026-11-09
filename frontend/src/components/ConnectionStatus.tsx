// ============================================
// Connection Status Indicator
// Shows WebSocket connection state
// ============================================

import { AlertCircle, Loader2, Wifi, WifiOff } from 'lucide-react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useCompactLayout } from '@/contexts/LayoutContext';

// ============================================
// Component
// ============================================

export default function ConnectionStatus() {
  const { status, error, reconnect } = useWebSocket();
  // Retry is what a phone player needs when the connection drops.
  const compact = useCompactLayout();

  // Don't show anything when fully connected
  if (status === 'connected') {
    return (
      <div role="status" className="flex items-center gap-2 text-sm text-brand-ink">
        <div className="relative">
          <Wifi className="w-4 h-4" />
          <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-moss-green" />
        </div>
        <span className="sr-only sm:not-sr-only">Connected</span>
      </div>
    );
  }

  // Connecting state
  if (status === 'connecting') {
    return (
      <div role="status" className="flex items-center gap-2 text-sm text-accent-ink">
        <div className="relative">
          <Loader2 className="w-4 h-4 animate-spin" />
          <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-warm-amber animate-pulse" />
        </div>
        <span className="sr-only sm:not-sr-only">Connecting...</span>
      </div>
    );
  }

  // Disconnected or error state
  return (
    <div role="status" className="flex items-center gap-2">
      <div className="flex items-center gap-2 text-sm text-danger-ink">
        <div className="relative">
          {status === 'error' ? (
            <AlertCircle className="w-4 h-4" />
          ) : (
            <WifiOff className="w-4 h-4" />
          )}
          <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-danger" />
        </div>
        <span className="sr-only sm:not-sr-only">
          {status === 'error' ? 'Connection Error' : 'Disconnected'}
        </span>
      </div>

      {/* Retry button */}
      <button
        onClick={reconnect}
        className={`text-xs px-2 py-1 rounded-sm bg-danger/10 text-danger-ink hover:bg-danger/15 transition-colors${compact ? ' min-h-11 min-w-11' : ''}`}
        title={error || 'Reconnect to server'}
      >
        Retry
      </button>
    </div>
  );
}
