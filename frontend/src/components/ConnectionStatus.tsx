// ============================================
// Connection Status Indicator
// Shows WebSocket connection state
// ============================================

import { AlertCircle, Loader2, Wifi, WifiOff } from 'lucide-react';
import { useWebSocket } from '@/contexts/WebSocketContext';

// ============================================
// Component
// ============================================

export default function ConnectionStatus() {
  const { status, error, reconnect } = useWebSocket();

  // Don't show anything when fully connected
  if (status === 'connected') {
    return (
      <div className="flex items-center gap-2 text-sm text-moss-green">
        <div className="relative">
          <Wifi className="w-4 h-4" />
          <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-moss-green" />
        </div>
        <span className="hidden sm:inline">Connected</span>
      </div>
    );
  }

  // Connecting state
  if (status === 'connecting') {
    return (
      <div className="flex items-center gap-2 text-sm text-warm-amber">
        <div className="relative">
          <Loader2 className="w-4 h-4 animate-spin" />
          <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-warm-amber animate-pulse" />
        </div>
        <span className="hidden sm:inline">Connecting...</span>
      </div>
    );
  }

  // Disconnected or error state
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 text-sm text-red-500">
        <div className="relative">
          {status === 'error' ? (
            <AlertCircle className="w-4 h-4" />
          ) : (
            <WifiOff className="w-4 h-4" />
          )}
          <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
        </div>
        <span className="hidden sm:inline">
          {status === 'error' ? 'Connection Error' : 'Disconnected'}
        </span>
      </div>

      {/* Retry button */}
      <button
        onClick={reconnect}
        className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors"
        title={error || 'Reconnect to server'}
      >
        Retry
      </button>
    </div>
  );
}

// ============================================
// Compact variant (for header use)
// ============================================

export function ConnectionStatusCompact() {
  const { status } = useWebSocket();

  // Status colors
  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'bg-moss-green';
      case 'connecting':
        return 'bg-warm-amber animate-pulse';
      case 'disconnected':
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-stone-gray';
    }
  };

  // Status tooltips
  const getStatusTooltip = () => {
    switch (status) {
      case 'connected':
        return 'Connected to server';
      case 'connecting':
        return 'Connecting to server...';
      case 'disconnected':
        return 'Disconnected from server';
      case 'error':
        return 'Connection error';
      default:
        return 'Unknown status';
    }
  };

  return (
    <div
      className="relative group"
      title={getStatusTooltip()}
    >
      <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />

      {/* Tooltip on hover */}
      <div className="absolute top-full right-0 mt-2 px-2 py-1 bg-black/80 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        {getStatusTooltip()}
      </div>
    </div>
  );
}
