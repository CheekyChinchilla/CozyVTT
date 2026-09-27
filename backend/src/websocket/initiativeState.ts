/**
 * Initiative State Manager
 * In-memory store for per-campaign combat state.
 *
 * Why in-memory instead of DB?
 * Initiative order is ephemeral combat data that resets between combats.
 * Token initiative *values* are persisted via the token.initiative field in the
 * Map.tokens JSON (updated through the existing token update path).
 * The round counter and active combatant are transient and intentionally lost
 * on server restart — the DM can simply start a new combat.
 */

export interface CombatantEntry {
  tokenId: string;
  /** The map the token is on, so a send can look the token up as it is now. */
  mapId: string;
  name: string;
  imageUrl: string;
  initiative: number | null;
  hp: { current: number; max: number; temp: number } | null;
  type: 'player' | 'npc' | 'object';
  disposition: 'friendly' | 'neutral' | 'hostile' | null;
}

export interface CombatState {
  active: boolean;
  round: number;
  /** tokenId of the currently-acting combatant, null if combat not started */
  currentTokenId: string | null;
  /** Ordered list of combatants (descending by initiative) */
  combatants: CombatantEntry[];
}

const campaignStates = new Map<string, CombatState>();

/**
 * How many times each campaign's state has been replaced. A send reads the
 * state, then the combatants' tokens and each player's plane, before it
 * emits; a change that lands meanwhile starts its own send with the newer
 * state, and the older send checks this before emitting so it never arrives
 * after the newer one. Ending the fight is the case that bit: its send has
 * nothing to look up and finished first, and the earlier send then showed
 * every client a fight that had ended.
 */
const versions = new Map<string, number>();

function bump(campaignId: string): void {
  versions.set(campaignId, (versions.get(campaignId) ?? 0) + 1);
}

export function getVersion(campaignId: string): number {
  return versions.get(campaignId) ?? 0;
}

function defaultState(): CombatState {
  return {
    active: false,
    round: 0,
    currentTokenId: null,
    combatants: [],
  };
}

export function getState(campaignId: string): CombatState {
  return campaignStates.get(campaignId) ?? defaultState();
}

export function setState(campaignId: string, state: CombatState): void {
  campaignStates.set(campaignId, state);
  bump(campaignId);
}

/** Forget every campaign's combat state, after a restore replaces the database under it. */
export function clearAllState(): void {
  for (const campaignId of campaignStates.keys()) bump(campaignId);
  campaignStates.clear();
}

export function clearState(campaignId: string): void {
  campaignStates.delete(campaignId);
  bump(campaignId);
}

/**
 * Drop the combatants `gone` names, when a token or a whole map is deleted.
 * An entry whose token is gone used to linger for the DM (the projection kept
 * the copy taken when it joined) while players no longer saw it, so the two
 * disagreed about the order. Returns whether anything was dropped.
 */
export function removeCombatants(campaignId: string, gone: (entry: CombatantEntry) => boolean): boolean {
  const state = getState(campaignId);
  const kept = state.combatants.filter((c) => !gone(c));
  if (kept.length === state.combatants.length) return false;
  const currentTokenId = kept.some((c) => c.tokenId === state.currentTokenId) ? state.currentTokenId : null;
  setState(campaignId, { ...state, combatants: kept, currentTokenId });
  return true;
}

/**
 * A sorted copy: descending initiative, the unrolled last. Ties keep the order
 * the combatants were added in (the sort is stable). A tie broken by name
 * would tell a player where an obscured combatant's real name falls in the
 * alphabet; the order of adding says nothing.
 */
export function sortCombatants(combatants: CombatantEntry[]): CombatantEntry[] {
  return [...combatants].sort((a, b) => {
    if (a.initiative === null) return b.initiative === null ? 0 : 1;
    if (b.initiative === null) return -1;
    return b.initiative - a.initiative;
  });
}

/** The fields of a map token a combatant is read from. */
export interface CombatantSource {
  id: string;
  name: string;
  imageUrl: string;
  hp?: { current: number; max: number; temp: number } | null;
  type?: 'player' | 'npc' | 'object';
  disposition?: 'friendly' | 'neutral' | 'hostile' | null;
}

/**
 * The state as one recipient may see it. Entries follow their tokens: a
 * player is given only the combatants whose token they were sent at all,
 * with the name, picture and hit points exactly as that token was sent to
 * them (the role filter has already dropped hidden tokens and the hit points
 * they may not know), so nothing reaches the tracker that the map keeps from
 * them. The DM gets every combatant with the token as it is now, and the copy
 * taken when it joined if the token is gone. The stored state is not changed.
 */
export function projectCombatState(
  state: CombatState,
  tokens: ReadonlyMap<string, CombatantSource>,
  isDM: boolean
): CombatState {
  const combatants: CombatantEntry[] = [];
  for (const entry of state.combatants) {
    const token = tokens.get(entry.tokenId);
    if (!token) {
      if (isDM) combatants.push({ ...entry });
      continue;
    }
    combatants.push({
      ...entry,
      name: token.name,
      imageUrl: token.imageUrl || '',
      hp: token.hp ?? null,
      type: token.type ?? 'npc',
      disposition: token.disposition ?? null,
    });
  }
  const currentTokenId = combatants.some((c) => c.tokenId === state.currentTokenId) ? state.currentTokenId : null;
  return { active: state.active, round: state.round, currentTokenId, combatants };
}
