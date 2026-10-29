// ============================================
// Game Store — live session state (zustand)
//
// Holds the real-time, socket-fed state of the current map session.
// Socket handlers write here directly via `useGameStore.getState()` —
// outside the React tree — so a token move re-renders only the
// components that subscribe to token data, never the whole campaign
// context subtree.
//
// BOUNDARY RULE (do not blur it):
//   - zustand (this store) owns LIVE SESSION STATE fed by sockets:
//     token positions, token lists, combat/initiative, characters' hit
//     points, who is online today and the current map's drawings; walls /
//     fog / lights may move here in future (they are currently
//     MapCanvas-local state with their own undo/redo history). The
//     previews of strokes on their way are not here: they change every
//     frame, and live in a ref the overlay reads (map/useMapDrawings.ts).
//   - react-query owns SERVER RESOURCES fetched over REST (campaign
//     lists, characters, assets, map metadata).
//   - CampaignContext owns campaign-level metadata and low-frequency
//     UI state (vibe, atmosphere, session).
//   Never represent the same datum in two of these places.
//   Some things here are the page's own and fed by no socket: the
//   cross-highlight peek and the selected token, which sit beside the
//   tokens because the map, the tracker and the keyboard all read them;
//   and the open session tab and the chat's unread count, which the
//   rail's tab bar and its panels both read.
//
// Write access: components and socket handlers mutate ONLY through the
// targeted actions below (patch/add/remove by id). Never rebuild the
// token list from a render-closure copy — a component subscribed with
// a movement-ignoring selector may hold an array with stale positions,
// and writing it back would teleport tokens.
// ============================================

import { create } from 'zustand';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import type { CombatState, Position, Token } from '@/types';
import type { CharacterHpInfo } from '@/utils/characterHp';
import type { Drawing } from '@/types/drawings';
import { drawingOrder } from '@/components/campaign/map/drawingGeometry';
import { isSessionTab, type SessionTab } from '@/components/campaign/sessionTabs';
import { optionalStorage } from '@/utils/optionalStorage';

/** Combat is inactive until the DM starts it; matches the server's default. */
/** The same record without `key`, or the same record when it has none. */
function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

const EMPTY_COMBAT: CombatState = {
  active: false,
  round: 0,
  currentTokenId: null,
  combatants: [],
};

/** Where this browser remembers the open session tab; the key the rail has always used. */
export const SESSION_TAB_KEY = 'cozyvtt-session-tab';

/** The session tab this browser last had open, or the chat. */
function storedSessionTab(): SessionTab {
  const stored = optionalStorage.getItem(SESSION_TAB_KEY);
  return isSessionTab(stored) ? stored : 'chat';
}

/** Whether the chat is on screen, so a message arriving is read as it comes. */
function chatOnScreen(s: { sessionTab: SessionTab; sessionShown: boolean }): boolean {
  return s.sessionShown && s.sessionTab === 'chat';
}

interface GameState {
  /**
   * Where a token someone else is carrying is drawn, by id. A drag frame moves
   * only this. `tokens[id].position`, which sight, lighting and explored
   * memory read, moves when the token is put down, so a DM carrying a
   * player's token about reveals nothing to that player on the way.
   */
  heldAt: Record<string, Position>;
  /** Normalized token map — authoritative live positions live here. */
  tokens: Record<string, Token>;
  /** Render/list order (server order preserved from the last full set). */
  tokenOrder: string[];
  /**
   * Turn order + whose turn it is, mirrored from `initiative.state`.
   * The server broadcasts the whole state on every mutation, so this is
   * replaced wholesale rather than patched. Read by the initiative
   * tracker (the list) and the map canvas (the active-token ring).
   */
  combat: CombatState;
  /**
   * Cross-highlight pointer: the token the user is currently pointing at,
   * wherever they're pointing at it. Hovering an initiative row lights the
   * token on the map; hovering a token on the map tints its initiative row.
   * `peekSource` says which side started it, so the map can skip its own
   * white ring when the map's existing blue hover outline already covers it.
   */
  peekTokenId: string | null;
  peekSource: 'tracker' | 'map' | null;
  /**
   * The token this page has selected, by a click or the keyboard: what the
   * arrow keys move, the turn keys turn and Enter opens the menu of. Kept
   * across a new token list while the list still holds it, since the server
   * sends the whole map again after any change to a token.
   */
  selectedTokenId: string | null;
  /**
   * Characters' hit points by character id, seeded from the roster and
   * kept current by `character.hp.updated`. Read by the roster and the
   * map's HP bars; here so a change in a fight re-renders only those.
   */
  characterHp: Record<string, CharacterHpInfo>;
  /**
   * Who has at least one live connection to the campaign, by user id, as the
   * last `presence.state` said; the server sends the whole set every time.
   * Read by the roster's dots and the chat's To list.
   */
  onlineUserIds: ReadonlySet<string>;
  /**
   * The drawings on the map on screen, as this member is sent them, in
   * drawing order (`drawingOrder`), with this page's own adds still on their
   * way (an id starting `pending:`). Replaced whole by `drawings:state` and
   * on a map switch.
   */
  drawings: Drawing[];
  /** The map `drawings` are for. */
  drawingsMapId: string | null;
  /**
   * The session panel open in the rail (Chat, Dice, Initiative, Notes or
   * Session), remembered in this browser under `SESSION_TAB_KEY`.
   */
  sessionTab: SessionTab;
  /**
   * How many chat messages from someone else arrived while the chat was not
   * on screen: the Chat tab's badge. Back to none when the chat is opened.
   */
  unreadChat: number;
  /**
   * Whether the session panels are on screen. The desktop's rail always
   * shows them; the compact layout keeps them in a sheet, shown only while it
   * is open, and says so here. A session's teardown leaves it as it is,
   * since the arrangement on screen keeps it.
   */
  sessionShown: boolean;

  // ---- Actions (named after the events that drive them) ----
  /** Wholesale replace — map load, map change, reconnect resync. */
  setTokens: (tokens: Token[]) => void;
  /** `token.moved` stream + local drag commit: position-only update. */
  applyTokenMove: (tokenId: string, position: Position) => void;
  /** `token.moved` — a drag frame (`dragging`) or where the token was put down. */
  receiveTokenMove: (tokenId: string, position: Position, dragging: boolean) => void;
  /** New token placed (REST response or DM action). */
  addToken: (token: Token) => void;
  /** `token:appeared` — update position if known, otherwise add. */
  revealToken: (token: Token) => void;
  /** `token:disappeared` / delete. */
  removeToken: (tokenId: string) => void;
  /** Targeted field update (visibility, layer, conditions, ...). */
  patchToken: (tokenId: string, patch: Partial<Token>) => void;
  /** Full-object replace after an editor save (NpcQuickEditor). */
  replaceToken: (token: Token) => void;
  /** `initiative.state` — wholesale replace of the combat snapshot. */
  setCombatState: (combat: CombatState) => void;
  /** Point at a token from either side; pass null to clear. */
  setPeekToken: (tokenId: string | null, source: 'tracker' | 'map') => void;
  /** Select a token on the map, or nothing. */
  selectToken: (tokenId: string | null) => void;
  /** `character.hp.updated`: one character's hit points. */
  setCharacterHp: (characterId: string, hp: CharacterHpInfo) => void;
  /** The roster's answer: every character it lists that has hit points. */
  seedCharacterHp: (entries: { id: string; hp: CharacterHpInfo | null }[]) => void;
  /** `presence.state`: the whole set of who is online. */
  setOnlineUserIds: (userIds: readonly string[]) => void;
  /** `drawings:state`, or a map switch: a map's drawings, whole. */
  setDrawings: (mapId: string | null, drawings: Drawing[]) => void;
  /**
   * `drawing:added`, or this page's own add: the drawing in its place in the
   * order, in place of the one with its id, or of `replacing` (this page's
   * drawing while it was on its way).
   */
  putDrawing: (drawing: Drawing, replacing?: string) => void;
  /** `drawing:removed`, or this page's own erase. */
  removeDrawing: (drawingId: string) => void;
  /** `drawings:cleared`, or a role that may not have some of them. */
  removeDrawings: (match: (drawing: Drawing) => boolean) => void;
  /** Open a session panel. Opening the chat reads what arrived meanwhile. */
  setSessionTab: (tab: SessionTab) => void;
  /** `chat.message` from someone else: one more unread, unless the chat is on screen. */
  countUnreadChat: () => void;
  /** The session panels are shown or put away. Shown on the chat, it reads what arrived meanwhile. */
  setSessionShown: (shown: boolean) => void;
  /**
   * Session teardown, and a page's start: what a page that opens a campaign
   * begins with. The open tab is read again from this browser's storage, as
   * the rail did when it was drawn.
   */
  clearGameState: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  heldAt: {},
  tokens: {},
  tokenOrder: [],
  combat: EMPTY_COMBAT,
  peekTokenId: null,
  peekSource: null,
  selectedTokenId: null,
  characterHp: {},
  onlineUserIds: new Set(),
  drawings: [],
  drawingsMapId: null,
  sessionTab: storedSessionTab(),
  unreadChat: 0,
  sessionShown: true,

  setTokens: (list) =>
    set((s) => ({
      tokens: Object.fromEntries(list.map((t) => [t.id, t])),
      tokenOrder: list.map((t) => t.id),
      heldAt: {},
      selectedTokenId: s.selectedTokenId !== null && list.some((t) => t.id === s.selectedTokenId) ? s.selectedTokenId : null,
    })),

  applyTokenMove: (tokenId, position) => {
    const token = get().tokens[tokenId];
    if (!token) return;
    set({ tokens: { ...get().tokens, [tokenId]: { ...token, position } }, heldAt: withoutKey(get().heldAt, tokenId) });
  },

  receiveTokenMove: (tokenId, position, dragging) => {
    const token = get().tokens[tokenId];
    if (!token) return;
    if (!dragging) {
      get().applyTokenMove(tokenId, position);
      return;
    }
    // A cancelled drag sends one last frame back to where the token stands.
    const home = token.position.x === position.x && token.position.y === position.y;
    set({ heldAt: home ? withoutKey(get().heldAt, tokenId) : { ...get().heldAt, [tokenId]: position } });
  },

  addToken: (token) =>
    set((s) => ({
      tokens: { ...s.tokens, [token.id]: token },
      tokenOrder: s.tokenOrder.includes(token.id) ? s.tokenOrder : [...s.tokenOrder, token.id],
    })),

  revealToken: (token) => {
    const existing = get().tokens[token.id];
    if (existing) {
      // Keep locally-known fields (e.g. visibility toggled this session);
      // the appear event is authoritative only for position.
      get().applyTokenMove(token.id, token.position);
    } else {
      get().addToken(token);
    }
  },

  removeToken: (tokenId) =>
    set((s) => {
      if (!s.tokens[tokenId]) return s;
      const tokens = { ...s.tokens };
      delete tokens[tokenId];
      return {
        tokens,
        tokenOrder: s.tokenOrder.filter((id) => id !== tokenId),
        heldAt: withoutKey(s.heldAt, tokenId),
        selectedTokenId: s.selectedTokenId === tokenId ? null : s.selectedTokenId,
      };
    }),

  patchToken: (tokenId, patch) => {
    const token = get().tokens[tokenId];
    if (!token) return;
    set({ tokens: { ...get().tokens, [tokenId]: { ...token, ...patch } } });
  },

  replaceToken: (token) => {
    if (!get().tokens[token.id]) return;
    set({ tokens: { ...get().tokens, [token.id]: token } });
  },

  setCombatState: (combat) => set({ combat }),

  setPeekToken: (tokenId, source) => {
    const s = get();
    // Ignore a clear arriving from the side that isn't currently pointing —
    // e.g. the map's mouse-leave firing after the tracker has taken over.
    if (tokenId === null && s.peekSource !== source) return;
    if (s.peekTokenId === tokenId && s.peekSource === (tokenId === null ? null : source)) return;
    set({ peekTokenId: tokenId, peekSource: tokenId === null ? null : source });
  },

  selectToken: (tokenId) => {
    if (get().selectedTokenId !== tokenId) set({ selectedTokenId: tokenId });
  },

  setCharacterHp: (characterId, hp) => set((s) => ({ characterHp: { ...s.characterHp, [characterId]: hp } })),

  seedCharacterHp: (entries) =>
    set((s) => {
      const characterHp = { ...s.characterHp };
      for (const { id, hp } of entries) {
        if (hp) characterHp[id] = hp;
      }
      return { characterHp };
    }),

  setOnlineUserIds: (userIds) => set({ onlineUserIds: new Set(userIds) }),

  setDrawings: (mapId, drawings) => set({ drawingsMapId: mapId, drawings: [...drawings].sort(drawingOrder) }),

  putDrawing: (drawing, replacing) =>
    set((s) => {
      const rest = s.drawings.filter((d) => d.id !== drawing.id && d.id !== replacing);
      // Most arrive last in the order; look for the place from the end.
      let at = rest.length;
      while (at > 0 && drawingOrder(rest[at - 1], drawing) > 0) at -= 1;
      return { drawings: [...rest.slice(0, at), drawing, ...rest.slice(at)] };
    }),

  removeDrawing: (drawingId) =>
    set((s) => (s.drawings.some((d) => d.id === drawingId) ? { drawings: s.drawings.filter((d) => d.id !== drawingId) } : s)),

  removeDrawings: (match) =>
    set((s) => (s.drawings.some(match) ? { drawings: s.drawings.filter((d) => !match(d)) } : s)),

  setSessionTab: (tab) => {
    optionalStorage.setItem(SESSION_TAB_KEY, tab);
    set((s) => ({ sessionTab: tab, unreadChat: chatOnScreen({ ...s, sessionTab: tab }) ? 0 : s.unreadChat }));
  },

  setSessionShown: (shown) =>
    set((s) => ({ sessionShown: shown, unreadChat: chatOnScreen({ ...s, sessionShown: shown }) ? 0 : s.unreadChat })),

  countUnreadChat: () => set((s) => (chatOnScreen(s) ? s : { unreadChat: s.unreadChat + 1 })),

  clearGameState: () =>
    set({
      tokens: {}, tokenOrder: [], heldAt: {}, combat: EMPTY_COMBAT, peekTokenId: null, peekSource: null, selectedTokenId: null,
      characterHp: {}, onlineUserIds: new Set(), drawings: [], drawingsMapId: null,
      sessionTab: storedSessionTab(), unreadChat: 0,
    }),
}));

// ============================================
// Selector hooks
// ============================================

const selectTokenList = (s: GameState): Token[] => s.tokenOrder.map((id) => s.tokens[id]);

/** Shallow array equality: same length and same element references. */
function tokenArrayEqual(a: Token[], b: Token[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Like {@link tokenArrayEqual} but treats tokens differing ONLY by
 * `position` as equal. Sidebar components (rosters, initiative) render
 * names/flags, not coordinates — with this equality they stay static
 * while tokens are dragged around the map.
 */
function tokenArrayEqualIgnoringMovement(a: Token[], b: Token[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ta = a[i];
    const tb = b[i];
    if (ta === tb) continue;
    if (ta.id !== tb.id) return false;
    // Compare every field except position by reference (token updates
    // spread the previous object, so unchanged fields keep identity).
    for (const key of Object.keys(tb) as (keyof Token)[]) {
      if (key === 'position') continue;
      if (ta[key] !== tb[key]) return false;
    }
    if (Object.keys(ta).length !== Object.keys(tb).length) return false;
  }
  return true;
}

/**
 * The live token list in render order. Re-renders on any token change,
 * including position — for the canvas and token-editing panels.
 */
export function useTokenList(): Token[] {
  return useStoreWithEqualityFn(useGameStore, selectTokenList, tokenArrayEqual);
}

/**
 * The token list for components that don't render positions (rosters,
 * initiative). Does NOT re-render on `token.moved` — only on add /
 * remove / reorder / non-positional field changes.
 */
export function useTokenListIgnoringMovement(): Token[] {
  return useStoreWithEqualityFn(useGameStore, selectTokenList, tokenArrayEqualIgnoringMovement);
}

/** Characters' hit points by character id, for the roster and the map's HP bars. */
export function useCharacterHp(): Record<string, CharacterHpInfo> {
  return useGameStore((s) => s.characterHp);
}

/** The current map's drawings, in drawing order: the map's layer and the draw tool. */
export function useDrawings(): Drawing[] {
  return useGameStore((s) => s.drawings);
}

/** Who has a live connection to the campaign, by user id: the roster's dots and the chat's To list. */
export function useOnlineUserIds(): ReadonlySet<string> {
  return useGameStore((s) => s.onlineUserIds);
}

/** The whole combat snapshot — for the initiative tracker, which renders it all. */
export function useCombatState(): CombatState {
  return useGameStore((s) => s.combat);
}

/**
 * Just the acting token's id, or null when combat is inactive. Deliberately
 * narrow: the map canvas re-renders on turn change only, not when a
 * combatant's HP ticks or the order is dragged around.
 */
export function useCurrentTurnTokenId(): string | null {
  return useGameStore((s) => (s.combat.active ? s.combat.currentTokenId : null));
}

/**
 * What initiative a token is holding, for the map's details panel.
 *
 * Three answers, deliberately distinguished so the panel can leave the row out
 * entirely rather than showing a misleading blank:
 *   `undefined` — not a combatant; the row should not appear at all
 *   `null`      — in the turn order but nothing has rolled for it yet
 *   a number    — its place in the order
 *
 * Returns a primitive rather than the combatant object so the identity is
 * stable: this is read by the map canvas, which must not re-render every time
 * the server rebroadcasts the whole combat snapshot.
 */
export function useTokenInitiative(tokenId: string | null): number | null | undefined {
  return useGameStore((s) => {
    if (!tokenId) return undefined;
    const entry = s.combat.combatants.find((c) => c.tokenId === tokenId);
    return entry ? entry.initiative : undefined;
  });
}

/** The pointed-at token, whichever side is pointing — for the tracker's row tint. */
export function usePeekTokenId(): string | null {
  return useGameStore((s) => s.peekTokenId);
}

/** The token this page has selected, or null. */
export function useSelectedTokenId(): string | null {
  return useGameStore((s) => s.selectedTokenId);
}

/**
 * The pointed-at token for the MAP to ring. Null when the map is the one
 * pointing: hovering a token already draws the blue outline there, and a
 * second white ring on top of it would just be noise.
 */
export function useMapPeekTokenId(): string | null {
  return useGameStore((s) => (s.peekSource === 'tracker' ? s.peekTokenId : null));
}
