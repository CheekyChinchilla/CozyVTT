import { io, Socket } from 'socket.io-client';
import { socketTarget } from '@/utils/socketTarget';
import { api } from '@/services/api';
import type {
  Map as CampaignMap,
  TokenMoveStartEvent,
  TokenMoveEvent,
  TokenMoveEndEvent,
  TokenMovedEvent,
  DiceRollEvent,
  DiceRolledEvent,
  DiceRolledSecretEvent,
  ChatMessageEvent,
  ChatMessageBroadcast,
  ChatSystemBroadcast,
  SessionStartEvent,
  SessionStartedBroadcast,
  SessionPausedBroadcast,
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
  DmTransferredBroadcast,
  MemberRoleChangedBroadcast,
  HitDiceSpendEvent,
  CombatState,
  InitiativeAddEvent,
  InitiativeRemoveEvent,
  InitiativeSetEvent,
  InitiativeRollEvent,
  InitiativeReorderEvent,
  MapPingEvent,
  MapPingedBroadcast,
} from '@/types';

// ============================================
// WebSocket Client Configuration
// ============================================

// Where the live connection lives.
//
// Empty means the page's own origin, which is the shipped default — nginx
// proxies /socket.io/* in production, and the Vite dev server does in
// development. A configured value is split into an origin and a path, because
// socket.io reads a URL's pathname as a *namespace* rather than a location:
// passing one straight to `io()` asks for a namespace the server never
// registered. See utils/socketTarget.
const { origin: SOCKET_ORIGIN, path: SOCKET_PATH } = socketTarget(
  import.meta.env.VITE_SOCKET_URL
);

type EventCallback<T = unknown> = (data: T) => void;

/**
 * A listener as the registry holds it, once its payload type has been erased.
 *
 * The registry stores handlers for every event together, so it cannot name one
 * payload type. `never` is what makes that sound rather than a fiction: a
 * parameter is contravariant, so `(data: DiceRolledEvent) => void` is assignable
 * to `(data: never) => void` while `(data: unknown) => void` is not — and unlike
 * `any` it does not hand callers a free pass to read anything off the payload.
 */
type StoredCallback = (data: never) => void;

/**
 * socket.io's own listener signature. Handing it a `StoredCallback` needs one
 * cast, because socket.io types its payload as `any[]` and nothing is assignable
 * to `never`. This is the real boundary — past this point the payload is
 * whatever arrived over the wire — so the cast is confined to the three places
 * that touch it rather than spread through the registry.
 */
type SocketIoListener = (...args: unknown[]) => void;

/** The server's answer to a socket whose sign-in it does not accept. */
function isSignInRefusal(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { message?: unknown }).message === 'Unauthorized';
}

class SocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  /** The server refused this socket's sign-in; the disconnect that follows must not reconnect. */
  private signInRefused = false;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private isConnecting = false;
  private campaignId: string | null = null;

  /**
   * Every application listener registered through this client, so they can be
   * re-attached when the underlying socket is replaced.
   *
   * `connect()` builds a brand new socket.io instance and throws the old one
   * away. Components subscribe from effects keyed on this client — a singleton
   * whose identity never changes — so those effects do not re-run and nothing
   * ever re-subscribed to the replacement. Listeners silently stopped firing
   * after any reconnect, which is why the dice panel could wedge on "Rolling…"
   * with no visible trigger: it never received the `dice.rolled` that clears the
   * flag.
   *
   * Keeping the registry here rather than asking each component to re-subscribe
   * means a component added later cannot reintroduce the bug.
   */
  private listeners = new Map<string, Set<StoredCallback>>();

  constructor() {
    // Socket will be initialized when connect() is called
  }

  /** Record a listener and attach it to the current socket, if there is one. */
  private addListener(event: string, callback: StoredCallback): void {
    let forEvent = this.listeners.get(event);
    if (!forEvent) {
      forEvent = new Set();
      this.listeners.set(event, forEvent);
    }
    forEvent.add(callback);
    this.socket?.on(event, callback as SocketIoListener);
  }

  /** Attach every recorded listener to a freshly created socket. */
  private reattachListeners(): void {
    if (!this.socket) return;
    for (const [event, callbacks] of this.listeners) {
      for (const callback of callbacks) {
        this.socket.on(event, callback as SocketIoListener);
      }
    }
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
      this.signInRefused = false;

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

      this.socket = io(SOCKET_ORIGIN, {
        path: SOCKET_PATH,
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

      // Re-attach application listeners to the new socket. Without this every
      // component subscription registered before a reconnect is lost — see the
      // note on `listeners` above.
      this.reattachListeners();

      // Set up authenticated listener FIRST (before any events can fire)
      this.socket.on('authenticated', () => {
        clearTimeout(connectionTimeout);
        this.isConnecting = false;
        // Only a socket that has joined counts as working. Resetting on the
        // transport's own connect let a server that closes every socket
        // before it joins be retried for ever.
        this.reconnectAttempts = 0;
        resolve();
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
        if (reason !== 'io server disconnect') return;
        // Server disconnected us. If it no longer accepts the sign-in,
        // another socket would only be refused again: ask the REST API,
        // whose answer to an ended sign-in sends the user to sign in.
        if (this.signInRefused) {
          this.signInRefused = false;
          void this.checkSignIn();
          return;
        }
        this.reconnect();
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
        if (isSignInRefusal(error)) this.signInRefused = true;
        clearTimeout(connectionTimeout);
        this.isConnecting = false;
        reject(error);
      });
    });
  }

  /**
   * The server refused the sign-in on a socket. The REST client redirects on
   * a 401 (to sign in) or a required password change, so any authenticated
   * request settles it; if the request succeeds, the sign-in is still good
   * and the refusal was momentary, so reconnect as usual.
   */
  private async checkSignIn(): Promise<void> {
    try {
      await api.listCampaigns();
    } catch {
      return;
    }
    this.reconnect();
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

  /** Whether a connect() is under way and has not yet joined or failed. */
  isConnectInProgress(): boolean {
    return this.isConnecting;
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

  // `never` rather than the `unknown` default: this event has no payload type
  // declared yet, and `EventCallback<unknown>` would reject a handler that names
  // its own payload — forcing the next subscriber into a cast. Same
  // contravariance the registry relies on. Replace with a real payload type when
  // `sync.state` gains one.
  onSyncState(callback: EventCallback<never>) {
    this.addListener('sync.state', callback);
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
    this.addListener('token.moved', callback);
  }

  // ============================================
  // Dice Rolling Events
  // ============================================

  emitDiceRoll(data: DiceRollEvent) {
    this.socket?.emit('dice.roll', data);
  }

  onDiceRolled(callback: EventCallback<DiceRolledEvent>) {
    this.addListener('dice.rolled', callback);
  }

  onDiceRolledSecret(callback: EventCallback<DiceRolledSecretEvent>) {
    this.addListener('dice.rolled.secret', callback);
  }

  emitClearDiceHistory() {
    this.socket?.emit('dice.clearHistory');
  }

  onDiceHistoryCleared(callback: EventCallback<void>) {
    this.addListener('dice.historyCleared', callback);
  }

  // ============================================
  // Presence
  // ============================================

  /**
   * Who is currently connected to the campaign.
   *
   * The server sends the full set on every join and leave rather than deltas,
   * so a missed event cannot leave the roster showing the wrong people. Note a
   * user may hold several sockets (two tabs) and appears once.
   */
  onPresenceState(callback: EventCallback<{ campaignId: string; onlineUserIds: string[] }>) {
    this.addListener('presence.state', callback);
  }

  /** Ask for the current set, for a view that mounted after the last push. */
  requestPresence() {
    this.socket?.emit('presence.request');
  }

  // ============================================
  // Chat Events
  // ============================================

  emitChatMessage(data: ChatMessageEvent) {
    this.socket?.emit('chat.message', data);
  }

  onChatMessage(callback: EventCallback<ChatMessageBroadcast>) {
    this.addListener('chat.message', callback);
  }

  onChatSystem(callback: EventCallback<ChatSystemBroadcast>) {
    this.addListener('chat.system', callback);
  }

  // ============================================
  // Map Events
  // ============================================

  emitMapChange(mapId: string) {
    this.socket?.emit('map.change', { mapId });
  }

  onMapChanged(callback: EventCallback<{ mapId: string; mapData: CampaignMap; spiritVisible?: boolean }>) {
    this.addListener('map.changed', callback);
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
    this.addListener('session.started', callback);
  }

  onSessionPaused(callback: EventCallback<SessionPausedBroadcast>) {
    this.addListener('session.paused', callback);
  }

  onSessionEnded(callback: EventCallback<{ message: string }>) {
    this.addListener('session.ended', callback);
  }

  onSessionResumed(callback: EventCallback<SessionStartedBroadcast>) {
    this.addListener('session.resumed', callback);
  }

  // ============================================
  // Vibe Tracker Events
  // ============================================

  emitVibeUpdate(data: VibeUpdateEvent) {
    this.socket?.emit('vibe.update', data);
  }

  onVibeUpdated(callback: EventCallback<VibeUpdatedBroadcast>) {
    this.addListener('vibe.updated', callback);
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
    this.addListener('spirit_layer.toggled', callback);
  }

  onSpiritLayerTokenToggled(callback: EventCallback<SpiritLayerTokenToggledBroadcast>) {
    this.addListener('spirit_layer.token.toggled', callback);
  }

  emitSpiritLayerStyleChange(style: string) {
    this.socket?.emit('spirit_layer.style_change', { style });
  }

  onSpiritLayerStyleChanged(callback: EventCallback<{ style: string }>) {
    this.addListener('spirit_layer.style_changed', callback);
  }

  // ============================================
  // Atmosphere Events
  // ============================================

  emitAtmosphereEffectSet(data: AtmosphereEffectSetEvent) {
    this.socket?.emit('atmosphere.effect.set', data);
  }

  onAtmosphereEffectUpdated(callback: EventCallback<AtmosphereEffectUpdatedBroadcast>) {
    this.addListener('atmosphere.effect.updated', callback);
  }

  emitAtmosphereAudioSet(data: AtmosphereAudioSetEvent) {
    this.socket?.emit('atmosphere.audio.set', data);
  }

  onAtmosphereAudioUpdated(callback: EventCallback<AtmosphereAudioUpdatedBroadcast>) {
    this.addListener('atmosphere.audio.updated', callback);
  }

  // ============================================
  // Character HP
  // ============================================

  emitCharacterHpUpdate(data: CharacterHpUpdateEvent) {
    this.socket?.emit('character.hp.update', data);
  }

  onCharacterHpUpdated(callback: EventCallback<CharacterHpUpdatedBroadcast>) {
    this.addListener('character.hp.updated', callback);
  }

  /**
   * The DM seat moved. Everyone in the campaign hears this, because everyone's
   * view of who may do what changes with it — not just the two people involved.
   */
  onDmTransferred(callback: EventCallback<DmTransferredBroadcast>) {
    this.addListener('campaign.dm.transferred', callback);
  }

  /**
   * A member's role changed. Everyone in the campaign hears it: the member's
   * own page has to change its controls, and everyone else's roster its list.
   */
  onMemberRoleChanged(callback: EventCallback<MemberRoleChangedBroadcast>) {
    this.addListener('campaign.role.changed', callback);
  }

  /**
   * Spend one hit die. The roll goes through emitDiceRoll like any other; this
   * is only the decrement, which the server applies so the count cannot be
   * kept up by a client that declines to send it.
   */
  emitHitDiceSpend(data: HitDiceSpendEvent) {
    this.socket?.emit('character.hitdice.spend', data);
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
    this.addListener('initiative.state', callback);
  }

  // ============================================
  // Map Pings
  // ============================================

  emitMapPing(data: MapPingEvent) {
    this.socket?.emit('map.ping', data);
  }

  onMapPinged(callback: EventCallback<MapPingedBroadcast>) {
    this.addListener('map.pinged', callback);
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

  on(event: string, callback: StoredCallback) {
    this.addListener(event, callback);
  }

  off(event: string, callback?: StoredCallback) {
    if (callback) {
      this.listeners.get(event)?.delete(callback);
      this.socket?.off(event, callback as SocketIoListener);
    } else {
      this.listeners.delete(event);
      this.socket?.off(event);
    }
  }

  removeAllListeners() {
    this.listeners.clear();
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
