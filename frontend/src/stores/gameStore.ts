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
//     token positions, token lists and combat/initiative today; walls /
//     fog / lights may move here in future (they are currently
//     MapCanvas-local state with their own undo/redo history).
//   - react-query owns SERVER RESOURCES fetched over REST (campaign
//     lists, characters, assets, map metadata).
//   - CampaignContext owns campaign-level metadata and low-frequency
//     UI state (vibe, atmosphere, session, HP cache).
//   Never represent the same datum in two of these places.
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

/** Combat is inactive until the DM starts it; matches the server's default. */
const EMPTY_COMBAT: CombatState = {
  active: false,
  round: 0,
  currentTokenId: null,
  combatants: [],
};

interface GameState {
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

  // ---- Actions (named after the events that drive them) ----
  /** Wholesale replace — map load, map change, reconnect resync. */
  setTokens: (tokens: Token[]) => void;
  /** `token.moved` stream + local drag commit: position-only update. */
  applyTokenMove: (tokenId: string, position: Position) => void;
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
  /** Session teardown. */
  clearGameState: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  tokens: {},
  tokenOrder: [],
  combat: EMPTY_COMBAT,
  peekTokenId: null,
  peekSource: null,

  setTokens: (list) =>
    set({
      tokens: Object.fromEntries(list.map((t) => [t.id, t])),
      tokenOrder: list.map((t) => t.id),
    }),

  applyTokenMove: (tokenId, position) => {
    const token = get().tokens[tokenId];
    if (!token) return;
    set({ tokens: { ...get().tokens, [tokenId]: { ...token, position } } });
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
      return { tokens, tokenOrder: s.tokenOrder.filter((id) => id !== tokenId) };
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

  clearGameState: () =>
    set({ tokens: {}, tokenOrder: [], combat: EMPTY_COMBAT, peekTokenId: null, peekSource: null }),
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

/** The pointed-at token, whichever side is pointing — for the tracker's row tint. */
export function usePeekTokenId(): string | null {
  return useGameStore((s) => s.peekTokenId);
}

/**
 * The pointed-at token for the MAP to ring. Null when the map is the one
 * pointing: hovering a token already draws the blue outline there, and a
 * second white ring on top of it would just be noise.
 */
export function useMapPeekTokenId(): string | null {
  return useGameStore((s) => (s.peekSource === 'tracker' ? s.peekTokenId : null));
}
