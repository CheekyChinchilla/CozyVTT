/**
 * Which map the tracker names when it rolls or sets a combatant's initiative.
 *
 * A combatant follows its token when the token moves to another map, and its
 * entry carries that map. The tracker still sent the map the table is
 * showing, so the server looked the token up in the wrong place: a roll was
 * answered "Token not found", and a typed value changed the order without
 * being written to the token.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InitiativeTracker from '../InitiativeTracker';
import { useGameStore } from '@/stores/gameStore';
import type { CombatantEntry, Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

const emitInitiativeRoll = vi.fn();
const emitInitiativeSet = vi.fn();

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: 'DM', currentMap: { id: 'map-shown' } }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'dm', platformRole: 'USER' } }),
}));

vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    socket: { emit: vi.fn(), on: vi.fn(), off: vi.fn(), emitInitiativeRoll, emitInitiativeSet },
    isConnected: true,
  }),
}));

const token = (id: string, name: string): Token => ({
  id, name, characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: false,
});

const moved: CombatantEntry = {
  tokenId: 'goblin', mapId: 'map-elsewhere', name: 'Goblin', imageUrl: '', initiative: 7, hp: null, type: 'npc', disposition: null,
};

beforeEach(() => {
  emitInitiativeRoll.mockClear();
  emitInitiativeSet.mockClear();
  useGameStore.getState().setTokens([token('hero', 'Hero')]);
  useGameStore.getState().setCombatState({ active: false, round: 0, currentTokenId: null, combatants: [moved] });
});

describe('a combatant whose token is on another map', () => {
  it('is rolled for on its own map', () => {
    render(<InitiativeTracker />);
    fireEvent.click(screen.getByTitle('Roll initiative for this token'));
    expect(emitInitiativeRoll).toHaveBeenCalledWith(expect.objectContaining({ tokenId: 'goblin', mapId: 'map-elsewhere' }));
  });

  it('has its value set on its own map', () => {
    render(<InitiativeTracker />);
    fireEvent.click(screen.getByTitle('Click to edit initiative value'));
    const input = screen.getByDisplayValue('7');
    fireEvent.change(input, { target: { value: '15' } });
    fireEvent.blur(input);
    expect(emitInitiativeSet).toHaveBeenCalledWith({ tokenId: 'goblin', mapId: 'map-elsewhere', value: 15 });
  });
});
