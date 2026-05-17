import { io, Socket } from 'socket.io-client';
import type {
  TokenMoveStartEvent,
  TokenMoveEvent,
  TokenMoveEndEvent,
  TokenMovedEvent,
  DiceRollEvent,
  DiceRolledEvent,
  DiceRolledSecretEvent,
  ChatMessageEvent,
  ChatMessageBroadcast,
  SessionStartEvent,
  SessionStartedBroadcast,
  VibeUpdateEvent,
  VibeUpdatedBroadcast,
  SpiritLayerToggleEvent,
  SpiritLayerToggledBroadcast,
  SpiritLayerTokenToggledBroadcast,
  AtmosphereEffectSetEvent,
  AtmosphereEffectUpdatedBroadcast,
  AtmosphereAudioSetEvent,
  AtmosphereAudioUpdatedBroadcast,
  CharacterHpUpdateEvent,
  CharacterHpUpdatedBroadcast,
  CombatState,
  InitiativeAddEvent,
  InitiativeRemoveEvent,
  InitiativeSetEvent,
  InitiativeRollEvent,
  InitiativeReorderEvent,
} from '@/types';

// ============================================
// WebSocket Client Configuration
// ============================================

// Use relative URL in development to leverage Vite's proxy (Docker support)
// Use absolute URL in production
// Empty string = relative URLs (Nginx proxies /socket.io/* to backend in production,
// Vite dev server proxies in development)
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

type EventCallback<T = any> = (data: T) => void;

class SocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private isConnecting = false;
  private campaignId: string | null = null;

  constructor() {
    // Socket will be initialized when connect() is called
  }

  // ============================================
  // Connection Management
  // ============================================

  connect(campaignId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected && this.campaignId === campaignId) {
        resolve();
        return;
      }

      if (this.isConnecting) {
        reject(new Error('Connection already in progress'));
        return;
      }

      this.isConnecting = true;
      this.campaignId = campaignId;

      // Disconnect and clean up any existing socket first
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.disconnect();
        this.socket = null;
      }

      // Set up a timeout to prevent hanging forever
      const connectionTimeout = setTimeout(() => {
        console.error('[Socket] Connection timeout - server did not respond within 10 seconds');
        this.isConnecting = false;
        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket.disconnect();
          this.socket = null;
        }
        reject(new Error('Connection timeout - server did not respond'));
      }, 10000);

      this.socket = io(SOCKET_URL, {
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: this.reconnectDelay,
        reconnectionDelayMax: 30000,       // Cap backoff at 30s
        reconnectionAttempts: this.maxReconnectAttempts,
        // Jitter (±50%) so a fleet of clients dropped at the same moment
        // doesn't all hit the server in lockstep — prevents thundering herd
        // after a backend restart or transient hosting hiccup.
        randomizationFactor: 0.5,
      });

      // Set up authenticated listener FIRST (before any events can fire)
      this.socket.on('authenticated', () => {
        clearTimeout(connectionTimeout);
        this.isConnecting = false;
        resolve();
      });

      // Low-level socket.io connection established
      this.socket.on('connect', () => {
        this.reconnectAttempts = 0;
      });

      // Backend ready — emit authenticate once we know the server is listening
      this.socket.on('connected', () => {
        if (!this.socket) {
          console.error('[Socket] Socket is null in connected handler');
          clearTimeout(connectionTimeout);
          this.isConnecting = false;
          reject(new Error('Socket is null in connected handler'));
          return;
        }

        this.socket.emit('authenticate', { campaignId });
      });

      // Connection error
      this.socket.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error);
        clearTimeout(connectionTimeout);
        this.isConnecting = false;
        reject(error);
      });

      // Disconnected
      this.socket.on('disconnect', (reason) => {
        if (reason === 'io server disconnect') {
          // Server disconnected us, need to manually reconnect
          this.reconnect();
        }
      });

      // Reconnection attempt
      this.socket.on('reconnect_attempt', (attemptNumber) => {
        this.reconnectAttempts = attemptNumber;
      });

      // Reconnection successful
      this.socket.on('reconnect', () => {
        this.reconnectAttempts = 0;
        // Re-authentication happens automatically when backend emits 'connected' event
      });

      // Reconnection failed
      this.socket.on('reconnect_failed', () => {
        console.error('[Socket] Reconnection failed after max attempts');
        clearTimeout(connectionTimeout);
        reject(new Error('Failed to reconnect after maximum attempts'));
      });

      // Error events from server
      this.socket.on('error', (error) => {
        console.error('[Socket] Server error event:', error);
        clearTimeout(connectionTimeout);
        this.isConnecting = false;
        reject(error);
      });
    });
  }

  private reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Socket] Max reconnection attempts reached');
      return;
    }

    // Exponential backoff capped at 30s, plus up to 1s jitter to avoid lockstep retries.
    const backoff = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), 30000);
    const delay = backoff + Math.floor(Math.random() * 1000);
    setTimeout(() => {
      this.reconnectAttempts++;
      if (this.campaignId) {
        this.connect(this.campaignId).catch((error) => {
          console.error('[Socket] Reconnection error:', error);
        });
      }
    }, delay);
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.campaignId = null;
    }

    // Reset connection state to allow reconnection
    this.isConnecting = false;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // ============================================
  // State Synchronization
  // ============================================

  requestSync(lastEventId?: string) {
    if (!this.socket?.connected) {
      return;
    }

    this.socket.emit('sync.request', {
      lastEventId,
    });
  }

  onSyncState(callback: EventCallback) {
    this.socket?.on('sync.state', callback);
  }

  // ============================================
  // Token Movement Events
  // ============================================

  emitTokenMoveStart(data: TokenMoveStartEvent) {
    this.socket?.emit('token.move.start', data);
  }

  emitTokenMove(data: TokenMoveEvent) {
    this.socket?.emit('token.move', data);
  }

  emitTokenMoveEnd(data: TokenMoveEndEvent) {
    this.socket?.emit('token.move.end', data);
  }

  onTokenMoved(callback: EventCallback<TokenMovedEvent>) {
    this.socket?.on('token.moved', callback);
  }

  // ============================================
  // Dice Rolling Events
  // ============================================

  emitDiceRoll(data: DiceRollEvent) {
    this.socket?.emit('dice.roll', data);
  }

  onDiceRolled(callback: EventCallback<DiceRolledEvent>) {
    this.socket?.on('dice.rolled', callback);
  }

  onDiceRolledSecret(callback: EventCallback<DiceRolledSecretEvent>) {
    this.socket?.on('dice.rolled.secret', callback);
  }

  emitClearDiceHistory() {
    this.socket?.emit('dice.clearHistory');
  }

  onDiceHistoryCleared(callback: EventCallback<void>) {
    this.socket?.on('dice.historyCleared', callback);
  }

  // ============================================
  // Chat Events
  // ============================================

  emitChatMessage(data: ChatMessageEvent) {
    this.socket?.emit('chat.message', data);
  }

  onChatMessage(callback: EventCallback<ChatMessageBroadcast>) {
    this.socket?.on('chat.message', callback);
  }

  onChatSystem(callback: EventCallback<{ content: string; metadata?: any; timestamp: string }>) {
    this.socket?.on('chat.system', callback);
  }

  // ============================================
  // Map Events
  // ============================================

  emitMapChange(mapId: string) {
    this.socket?.emit('map.change', { mapId });
  }

  onMapChanged(callback: EventCallback<{ mapId: string; mapData: any }>) {
    this.socket?.on('map.changed', callback);
  }

  // ============================================
  // Session Events
  // ============================================

  emitSessionStart(data: SessionStartEvent) {
    this.socket?.emit('session.start', data);
  }

  emitSessionPause() {
    this.socket?.emit('session.pause', {});
  }

  emitSessionEnd(saveState: boolean = true) {
    this.socket?.emit('session.end', { saveState });
  }

  onSessionStarted(callback: EventCallback<SessionStartedBroadcast>) {
    this.socket?.on('session.started', callback);
  }

  onSessionPaused(callback: EventCallback) {
    this.socket?.on('session.paused', callback);
  }

  onSessionEnded(callback: EventCallback<{ message: string }>) {
    this.socket?.on('session.ended', callback);
  }

  onSessionResumed(callback: EventCallback) {
    this.socket?.on('session.resumed', callback);
  }

  // ============================================
  // Vibe Tracker Events
  // ============================================

  emitVibeUpdate(data: VibeUpdateEvent) {
    this.socket?.emit('vibe.update', data);
  }

  onVibeUpdated(callback: EventCallback<VibeUpdatedBroadcast>) {
    this.socket?.on('vibe.updated', callback);
  }

  // ============================================
  // Spirit Layer Events
  // ============================================

  emitSpiritLayerToggle(data: SpiritLayerToggleEvent) {
    this.socket?.emit('spirit_layer.toggle', data);
  }

  emitSpiritLayerTokenToggle(mapId: string, tokenId: string, visible: boolean) {
    this.socket?.emit('spirit_layer.token.toggle', { mapId, tokenId, visible });
  }

  onSpiritLayerToggled(callback: EventCallback<SpiritLayerToggledBroadcast>) {
    this.socket?.on('spirit_layer.toggled', callback);
  }

  onSpiritLayerTokenToggled(callback: EventCallback<SpiritLayerTokenToggledBroadcast>) {
    this.socket?.on('spirit_layer.token.toggled', callback);
  }

  emitSpiritLayerStyleChange(style: string) {
    this.socket?.emit('spirit_layer.style_change', { style });
  }

  onSpiritLayerStyleChanged(callback: EventCallback<{ style: string }>) {
    this.socket?.on('spirit_layer.style_changed', callback);
  }

  // ============================================
  // Atmosphere Events
  // ============================================

  emitAtmosphereEffectSet(data: AtmosphereEffectSetEvent) {
    this.socket?.emit('atmosphere.effect.set', data);
  }

  onAtmosphereEffectUpdated(callback: EventCallback<AtmosphereEffectUpdatedBroadcast>) {
    this.socket?.on('atmosphere.effect.updated', callback);
  }

  emitAtmosphereAudioSet(data: AtmosphereAudioSetEvent) {
    this.socket?.emit('atmosphere.audio.set', data);
  }

  onAtmosphereAudioUpdated(callback: EventCallback<AtmosphereAudioUpdatedBroadcast>) {
    this.socket?.on('atmosphere.audio.updated', callback);
  }

  // ============================================
  // Character HP
  // ============================================

  emitCharacterHpUpdate(data: CharacterHpUpdateEvent) {
    this.socket?.emit('character.hp.update', data);
  }

  onCharacterHpUpdated(callback: EventCallback<CharacterHpUpdatedBroadcast>) {
    this.socket?.on('character.hp.updated', callback);
  }

  // ============================================
  // Initiative Tracker Events
  // ============================================

  emitInitiativeAdd(data: InitiativeAddEvent) {
    this.socket?.emit('initiative.add', data);
  }

  emitInitiativeRemove(data: InitiativeRemoveEvent) {
    this.socket?.emit('initiative.remove', data);
  }

  emitInitiativeSet(data: InitiativeSetEvent) {
    this.socket?.emit('initiative.set', data);
  }

  emitInitiativeRoll(data: InitiativeRollEvent) {
    this.socket?.emit('initiative.roll', data);
  }

  emitInitiativeReorder(data: InitiativeReorderEvent) {
    this.socket?.emit('initiative.reorder', data);
  }

  emitInitiativeStart() {
    this.socket?.emit('initiative.start');
  }

  emitInitiativeNext() {
    this.socket?.emit('initiative.next');
  }

  emitInitiativeEnd() {
    this.socket?.emit('initiative.end');
  }

  emitInitiativeRequestState() {
    this.socket?.emit('initiative.request_state');
  }

  onInitiativeState(callback: EventCallback<CombatState>) {
    this.socket?.on('initiative.state', callback);
  }

  // ============================================
  // Heartbeat
  // ============================================

  startHeartbeat(interval: number = 30000) {
    if (!this.socket) return;

    const heartbeatInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('ping');
      } else {
        clearInterval(heartbeatInterval);
      }
    }, interval);

    this.socket.on('pong', () => {
      // Connection is healthy
    });

    return () => clearInterval(heartbeatInterval);
  }

  // ============================================
  // Event Cleanup
  // ============================================

  on(event: string, callback: EventCallback) {
    this.socket?.on(event, callback);
  }

  off(event: string, callback?: EventCallback) {
    if (callback) {
      this.socket?.off(event, callback);
    } else {
      this.socket?.off(event);
    }
  }

  removeAllListeners() {
    this.socket?.removeAllListeners();
  }

  // ============================================
  // Socket Instance Access
  // ============================================

  getSocket(): Socket | null {
    return this.socket;
  }
}

// Export singleton instance
export const socketClient = new SocketClient();
export default socketClient;
