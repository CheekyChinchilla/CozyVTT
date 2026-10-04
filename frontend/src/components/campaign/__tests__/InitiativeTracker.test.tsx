/**
 * What the initiative tracker calls a combatant a player was sent nameless.
 *
 * A player receives an obscured token, and its combatant entry, with the name
 * blanked. The rows already call such an entry an unknown creature; the
 * active-turn banner printed the blank name raw, so it read "'s turn".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import InitiativeTracker from '../InitiativeTracker';
import { useGameStore } from '@/stores/gameStore';
import type { CombatantEntry, Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: 'PLAYER', currentMap: { id: 'map-1' } }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'alice', platformRole: 'USER' } }),
}));

vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }, isConnected: true }),
}));

const token = (id: string, name: string): Token => ({
  id, name, characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: name === '',
});

const entry = (tokenId: string, name: string, initiative: number): CombatantEntry => ({
  tokenId, mapId: 'map-1', name, imageUrl: '', initiative, hp: null, type: 'npc', disposition: null,
});

beforeEach(() => {
  useGameStore.getState().setTokens([token('v', ''), token('h', 'Hero')]);
});

describe('the active-turn banner', () => {
  it('calls a nameless current combatant an unknown creature, as the rows do', () => {
    useGameStore.getState().setCombatState({
      active: true, round: 1, currentTokenId: 'v',
      combatants: [entry('v', '', 18), entry('h', 'Hero', 12)],
    });

    render(<InitiativeTracker />);

    expect(screen.getByText("Unknown creature's turn")).toBeInTheDocument();
  });

  it('names a known current combatant', () => {
    useGameStore.getState().setCombatState({
      active: true, round: 1, currentTokenId: 'h',
      combatants: [entry('v', '', 18), entry('h', 'Hero', 12)],
    });

    render(<InitiativeTracker />);

    expect(screen.getByText("Hero's turn")).toBeInTheDocument();
  });
});
