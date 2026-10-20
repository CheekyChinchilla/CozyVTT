/**
 * What the initiative tracker calls a combatant a player was sent nameless.
 *
 * A player receives an obscured token, and its combatant entry, with the name
 * blanked. The rows already call such an entry an unknown creature; the
 * active-turn banner printed the blank name raw, so it read "'s turn".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import InitiativeTracker from '../InitiativeTracker';
import { useGameStore } from '@/stores/gameStore';
import type { CombatantEntry, Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

const seat = vi.hoisted(() => ({ role: 'PLAYER' }));
const emitInitiativeReorder = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: seat.role, currentMap: { id: 'map-1' } }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'alice', platformRole: 'USER' } }),
}));

vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: { emit: vi.fn(), on: vi.fn(), off: vi.fn(), emitInitiativeReorder }, isConnected: true }),
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
  seat.role = 'PLAYER';
  emitInitiativeReorder.mockReset();
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

describe('the tracker from the keyboard', () => {
  const threeReady = () => useGameStore.getState().setCombatState({
    active: false, round: 0, currentTokenId: null,
    combatants: [entry('h', 'Hero', 18), entry('g', 'Goblin', 12), entry('o', 'Ogre', 6)],
  });

  it('opens Add Combatant as a dialog named for it', () => {
    seat.role = 'DM';
    threeReady();
    render(<InitiativeTracker />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Combatant' }));

    expect(screen.getByRole('dialog', { name: 'Add Combatant' })).toBeInTheDocument();
  });

  // Each choice held a picture whose alt text repeated the name beside it,
  // so it was read as "Orc Orc npc".
  it('names each token in Add Combatant once', () => {
    seat.role = 'DM';
    threeReady();
    useGameStore.getState().setTokens([{ ...token('orc', 'Orc'), imageUrl: '/api/assets/tokens/orc' }]);
    render(<InitiativeTracker />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Combatant' }));

    expect(within(screen.getByRole('dialog', { name: 'Add Combatant' })).getByRole('button', { name: 'Orc npc' })).toBeInTheDocument();
  });

  it('lets the DM edit a value from a button that says what it holds', () => {
    seat.role = 'DM';
    threeReady();
    render(<InitiativeTracker />);

    fireEvent.click(screen.getByRole('button', { name: 'Initiative for Goblin: 12. Edit' }));

    expect(screen.getByRole('spinbutton', { name: 'Initiative for Goblin' })).toHaveValue(12);
  });

  it('moves a combatant one place down with the arrow key, and says where it went', () => {
    seat.role = 'DM';
    threeReady();
    render(<InitiativeTracker />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Move Hero' }), { key: 'ArrowDown' });

    expect(emitInitiativeReorder).toHaveBeenCalledWith({ orderedTokenIds: ['g', 'h', 'o'] });
    expect(screen.getByRole('status')).toHaveTextContent('Hero moved to 2 of 3');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move Hero' }));
    expect(useGameStore.getState().combat.combatants.map((c) => c.tokenId)).toEqual(['g', 'h', 'o']);
  });

  // The map listens for the arrow keys on the window to nudge selected walls,
  // so a move from the grip moved them too.
  it('keeps the arrow key from reaching the map', () => {
    seat.role = 'DM';
    threeReady();
    render(<InitiativeTracker />);
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    try {
      fireEvent.keyDown(screen.getByRole('button', { name: 'Move Hero' }), { key: 'ArrowDown' });
    } finally {
      window.removeEventListener('keydown', onWindowKey);
    }
    expect(onWindowKey).not.toHaveBeenCalled();
  });

  it('moves a combatant up, and goes no further than the top', () => {
    seat.role = 'DM';
    threeReady();
    render(<InitiativeTracker />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Move Hero' }), { key: 'ArrowUp' });
    expect(emitInitiativeReorder).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Move Ogre' }), { key: 'ArrowUp' });
    expect(emitInitiativeReorder).toHaveBeenCalledWith({ orderedTokenIds: ['h', 'o', 'g'] });
  });

  it('gives a player no way to reorder, and no button on the values', () => {
    threeReady();
    render(<InitiativeTracker />);

    expect(screen.queryByRole('button', { name: /^Move / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Initiative for / })).toBeNull();
    expect(within(document.body).getByText('18')).toBeInTheDocument();
  });
});
