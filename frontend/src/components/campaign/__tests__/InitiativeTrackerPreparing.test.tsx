/**
 * The initiative tracker while the DM prepares a map the table is not on.
 *
 * The order stays the table's, but the tokens the tracker can offer are the
 * ones on the DM's screen. Add Combatant listed the prepared map's tokens
 * and sent the table's map with them, which the server answered "Token not
 * found". And a combatant standing on a map the table is not on could be
 * rolled for in front of everyone, under its name.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import InitiativeTracker from '../InitiativeTracker';
import { useGameStore } from '@/stores/gameStore';
import type { CombatantEntry, Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

const seat = vi.hoisted(() => ({ viewedMapId: 'map-prepared' }));
const emitInitiativeAdd = vi.fn();
const rollDice = vi.fn();

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    userRole: 'DM',
    campaign: { id: 'campaign-1', gameSystem: 'DND_5E', memberships: [], characters: [] },
    currentMap: { id: 'map-table' },
    viewedMap: { id: seat.viewedMapId },
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'dm', platformRole: 'USER' } }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    socket: { emit: vi.fn(), on: vi.fn(), off: vi.fn(), emitInitiativeAdd, rollDice },
    isConnected: true,
  }),
}));

const token = (id: string, name: string): Token => ({
  id, name, characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: false,
});
const entry = (tokenId: string, mapId: string): CombatantEntry => ({
  tokenId, mapId, name: 'Lich', imageUrl: '', initiative: 12, hp: null, type: 'npc', disposition: null, characterId: null,
});

/** A custom roll from the combatant's Roll..., as the DM makes it. */
async function rollFromRow(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
  fireEvent.click(screen.getByText('Roll...'));
  fireEvent.change(screen.getByPlaceholderText('e.g. 2d6+3'), { target: { value: '1d20' } });
  await act(async () => { fireEvent.click(screen.getByTitle('Roll')); });
}

beforeEach(() => {
  seat.viewedMapId = 'map-prepared';
  emitInitiativeAdd.mockClear();
  rollDice.mockReset().mockResolvedValue({ ok: true, id: 'roll-1' });
  useGameStore.getState().setTokens([token('lich', 'Lich')]);
  useGameStore.getState().setCombatState({ active: false, round: 0, currentTokenId: null, combatants: [] });
});

describe('Add Combatant while preparing', () => {
  it("adds a token of the map on screen, on that map", () => {
    render(<InitiativeTracker />);
    fireEvent.click(screen.getByText('Add Combatant'));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Lich'));
    expect(emitInitiativeAdd).toHaveBeenCalledWith({ tokenId: 'lich', mapId: 'map-prepared' });
  });
});

describe("a combatant's rolls", () => {
  it('are for the DM alone when it stands on a map the table is not on', async () => {
    useGameStore.getState().setCombatState({ active: false, round: 0, currentTokenId: null, combatants: [entry('lich', 'map-prepared')] });
    render(<InitiativeTracker />);
    await rollFromRow('Lich');
    expect(rollDice).toHaveBeenCalledWith(expect.objectContaining({ expression: '1d20', secret: true }));
  });

  it("go to the whole table when it stands on the table's map", async () => {
    seat.viewedMapId = 'map-table';
    useGameStore.getState().setCombatState({ active: false, round: 0, currentTokenId: null, combatants: [entry('lich', 'map-table')] });
    render(<InitiativeTracker />);
    await rollFromRow('Lich');
    expect(rollDice).toHaveBeenCalledWith(expect.not.objectContaining({ secret: true }));
  });
});
