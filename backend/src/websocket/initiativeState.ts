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
}

export function clearState(campaignId: string): void {
  campaignStates.delete(campaignId);
}

/** Sort combatants in-place: descending initiative, nulls last, then by name for tie-breaking */
export function sortCombatants(combatants: CombatantEntry[]): CombatantEntry[] {
  return [...combatants].sort((a, b) => {
    if (a.initiative === null && b.initiative === null) return a.name.localeCompare(b.name);
    if (a.initiative === null) return 1;
    if (b.initiative === null) return -1;
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    return a.name.localeCompare(b.name); // alphabetical tie-break
  });
}
