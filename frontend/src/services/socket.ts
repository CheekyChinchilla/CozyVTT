import { io, Socket } from 'socket.io-client';
import { socketTarget } from '@/utils/socketTarget';
import { api } from '@/services/api';
import { apiErrorStatus, errorMessage } from '@/utils/errors';
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
  ChatMessageAck,
  DiceRollAck,
  DoneAck,
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

/** How long a chat message waits for the server's answer before it counts as not sent. */
const CHAT_ANSWER_TIMEOUT_MS = 10_000;
/** How long a roll, or a clear of the dice history, waits for its answer. */
const ROLL_ANSWER_TIMEOUT_MS = 10_000;

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
  /** Sign-in checks that failed for a reason other than the sign-in; see checkSignIn. */
  private signInChecks = 0;
  /** The server refused this socket's sign-in; the disconnect that follows must not reconnect. */
  private signInRefused = false;
  /**
   * The server said this connection may no longer use its campaign
   * (`campaign.access.revoked`): removed, the campaign deleted, or the
   * sign-in ended. Nothing is reconnected after that; the page says why.
   */
  private accessRevoked = false;
  /**
   * How many times in a row a socket the server refused is checked against
   * the REST API (checkSignIn), and rebuilt after a refusal. A refusal comes
   * from a server that is up, so retrying it for ever would only repeat it;
   * a socket that got no answer at all is retried for as long as it takes.
   */
  private maxReconnectAttempts = 5;
  /** Sockets rebuilt after a refusal since the last one that joined. */
  private refusedRetries = 0;
  /** The current socket was refused (an `error`) before it joined the campaign. */
  private refusedBeforeJoin = false;
  /** The current socket has joined the campaign. */
  private joined = false;
  private reconnectDelay = 1000; // Start with 1 second
  private isConnecting = false;
  private campaignId: string | null = null;
  /** The ten second limit on the connect under way, kept so leaving the page can end it. */
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  /** The pause before the next reconnect, kept so leaving the page can cancel it. */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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

  /**
   * Told each time a socket this client built on its own, after the server
   * closed the last one, has joined the campaign. Whoever connected listens
   * on the socket it was handed; this is how it learns there is a new one.
   */
  private rebuiltCallbacks = new Set<() => void>();

  /**
   * Told of every socket this client builds, as it is built and before it
   * has connected, so the connection badge follows each one from the start:
   * socket.io may get a socket through on its own retry after the connect
   * that built it has already failed.
   */
  private createdCallbacks = new Set<(socket: Socket) => void>();

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
      this.accessRevoked = false;
      this.refusedBeforeJoin = false;
      this.joined = false;

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

      this.connectionTimer = connectionTimeout;

      this.socket = io(SOCKET_ORIGIN, {
        path: SOCKET_PATH,
        withCredentials: true,
        transports: ['websocket', 'polling'],
        // Polling when the WebSocket is refused, as by a proxy that does not
        // pass the browser's host name, which the page's policy names for it:
        // a slower table, where without this there was none.
        tryAllTransports: true,
        reconnection: true,
        reconnectionDelay: this.reconnectDelay,
        reconnectionDelayMax: 30000,       // Cap backoff at 30s
        // For as long as it takes: a server restart or an upgrade can be
        // down for minutes, and giving up after about 30 seconds left every
        // table waiting for someone to press Retry.
        reconnectionAttempts: Infinity,
        // Jitter (±50%) so a fleet of clients dropped at the same moment
        // doesn't all hit the server in lockstep — prevents thundering herd
        // after a backend restart or transient hosting hiccup.
        randomizationFactor: 0.5,
      });

      // Re-attach application listeners to the new socket. Without this every
      // component subscription registered before a reconnect is lost — see the
      // note on `listeners` above.
      this.reattachListeners();
      for (const callback of this.createdCallbacks) callback(this.socket);

      // Set up authenticated listener FIRST (before any events can fire)
      this.socket.on('authenticated', () => {
        clearTimeout(connectionTimeout);
        this.isConnecting = false;
        // Only a socket that has joined counts as working. Resetting on the
        // transport's own connect let a server that closes every socket
        // before it joins be retried for ever.
        this.reconnectAttempts = 0;
        this.signInChecks = 0;
        this.refusedRetries = 0;
        this.joined = true;
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
        // Told why first: there is nothing to reconnect to or to ask about.
        if (this.accessRevoked) return;
        // Server disconnected us. If it no longer accepts the sign-in,
        // another socket would only be refused again: ask the REST API,
        // whose answer to an ended sign-in sends the user to sign in.
        if (this.signInRefused) {
          this.signInRefused = false;
          void this.checkSignIn();
          return;
        }
        // Refused before it joined (too many tabs open, say): the server is
        // up and said no, so only a few more tries. Closed after joining, as
        // a restart does: for as long as it takes.
        this.reconnect(this.refusedBeforeJoin);
      });

      // socket.io's own reconnecting is reported on the manager
      // (this.socket.io), where WebSocketContext listens; `authenticated`
      // above resets the count on every rejoin.

      // The connection's access has ended, with the reason: the page shows
      // it (useAccessRevoked), and the disconnect that may follow is final.
      this.socket.on('campaign.access.revoked', () => {
        this.accessRevoked = true;
      });

      // Error events from server
      this.socket.on('error', (error) => {
        console.error('[Socket] Server error event:', error);
        if (isSignInRefusal(error)) this.signInRefused = true;
        if (!this.joined) this.refusedBeforeJoin = true;
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
    } catch (error) {
      // Signed out or held for a password change: the API client sends the
      // page to sign in, and there is nothing to reconnect to. Anything else
      // (the network, a server that could not read its sessions) says nothing
      // about the sign-in, so ask again after a while, within the attempts.
      const status = apiErrorStatus(error);
      if (status === 401 || status === 403) return;
      if (this.signInChecks >= this.maxReconnectAttempts) return;
      const delay = Math.min(this.reconnectDelay * Math.pow(2, this.signInChecks), 30000);
      this.signInChecks++;
      setTimeout(() => { void this.checkSignIn(); }, delay);
      return;
    }
    // The checks have attempts of their own, so a run the network cut short
    // still leaves the reconnect its own. Each reconnect spends one of those,
    // so a socket refused every time while the REST API takes the same
    // sign-in (a proxy dropping the cookie on /socket.io) still stops.
    this.signInChecks = 0;
    this.reconnect(true);
  }

  /** Call `callback` whenever this client has replaced its socket on its own; returns the unsubscribe. */
  onRebuilt(callback: () => void): () => void {
    this.rebuiltCallbacks.add(callback);
    return () => { this.rebuiltCallbacks.delete(callback); };
  }

  /** Call `callback` with every socket this client builds, as it is built; returns the unsubscribe. */
  onCreated(callback: (socket: Socket) => void): () => void {
    this.createdCallbacks.add(callback);
    return () => { this.createdCallbacks.delete(callback); };
  }

  /**
   * Build a new socket after the server closed the last one, waiting longer
   * each time up to 30 seconds. After a refusal (`refused`) only a few times
   * in a row; otherwise for as long as it takes: a socket that gets no answer
   * is thrown away by connect's timeout and another is built, while one
   * socket.io is still retrying by itself is left to it.
   */
  private reconnect(refused = false) {
    if (!this.campaignId) return;
    if (refused) {
      if (this.refusedRetries >= this.maxReconnectAttempts) {
        console.error('[Socket] The server keeps refusing this connection; not trying again');
        return;
      }
      this.refusedRetries++;
    }

    // Exponential backoff capped at 30s, plus up to 1s jitter to avoid lockstep retries.
    const backoff = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), 30000);
    const delay = backoff + Math.floor(Math.random() * 1000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      if (this.campaignId) {
        this.connect(this.campaignId)
          .then(() => { for (const callback of this.rebuiltCallbacks) callback(); })
          .catch((error) => {
            console.error('[Socket] Reconnection error:', errorMessage(error));
            if (!this.socket && !this.accessRevoked) this.reconnect();
          });
      }
    }, delay);
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    // Forget the campaign whether or not a socket is held: a connect that
    // timed out leaves none, and the reconnect loop that follows it carries on
    // for as long as a campaign is named. A connect that is abandoned must
    // not time out whatever is connected after it, either.
    this.campaignId = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.connectionTimer) clearTimeout(this.connectionTimer);
    this.connectionTimer = null;

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

  /** Whether the current socket has joined its campaign at least once. */
  hasJoined(): boolean {
    return this.joined;
  }

  /**
   * A refusal from the server: `{ message }`, for a request sent without an
   * acknowledgement. One sent with one is answered through it instead.
   */
  onServerRefusal(callback: EventCallback<{ message?: string }>) {
    this.addListener('error', callback);
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

  /**
   * Roll at the table and wait for the server's answer: the stored roll's id,
   * or why it was refused. With no connection, or no answer in
   * ROLL_ANSWER_TIMEOUT_MS, it counts as not made.
   */
  rollDice(data: DiceRollEvent): Promise<DiceRollAck> {
    return this.askFor<DiceRollAck>('dice.roll', data, ROLL_ANSWER_TIMEOUT_MS, "That roll didn't come back. Check your connection and try again.");
  }

  onDiceRolled(callback: EventCallback<DiceRolledEvent>) {
    this.addListener('dice.rolled', callback);
  }

  onDiceRolledSecret(callback: EventCallback<DiceRolledSecretEvent>) {
    this.addListener('dice.rolled.secret', callback);
  }

  /** Clear the dice history for everyone (the DM's), and wait for the answer. */
  clearDiceHistory(): Promise<DoneAck> {
    return this.askFor<DoneAck>('dice.clearHistory', undefined, ROLL_ANSWER_TIMEOUT_MS, 'No answer from the server');
  }

  /**
   * Send an event with an acknowledgement and resolve with the server's
   * answer, or with a refusal saying `noAnswer` when none comes in time, or
   * at once with no connection.
   */
  private askFor<T extends { ok: boolean }>(event: string, data: unknown, timeoutMs: number, noAnswer: string): Promise<T | { ok: false; error: string }> {
    const socket = this.socket;
    if (!socket?.connected) return Promise.resolve({ ok: false, error: 'Not connected to server' });
    return new Promise((resolve) => {
      const answered = (err: Error | null, answer?: T) => resolve(err || !answer ? { ok: false, error: noAnswer } : answer);
      if (data === undefined) socket.timeout(timeoutMs).emit(event, answered);
      else socket.timeout(timeoutMs).emit(event, data, answered);
    });
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

  /**
   * Send a chat message and wait for the server's answer: the stored id, or
   * why it was refused. With no connection, or no answer in
   * CHAT_ANSWER_TIMEOUT_MS, it counts as not sent; a resend with the same
   * `clientId` cannot post it twice.
   */
  sendChatMessage(data: ChatMessageEvent): Promise<ChatMessageAck> {
    const socket = this.socket;
    if (!socket?.connected) return Promise.resolve({ ok: false, error: 'Not connected' });
    return new Promise((resolve) => {
      socket.timeout(CHAT_ANSWER_TIMEOUT_MS).emit('chat.message', data, (err: Error | null, answer?: ChatMessageAck) => {
        resolve(err || !answer ? { ok: false, error: 'No answer from the server' } : answer);
      });
    });
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
   * Spend one hit die. The roll goes through rollDice like any other; this
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
