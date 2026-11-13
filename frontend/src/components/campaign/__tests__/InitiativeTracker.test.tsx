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
  useCampaign: () => ({ userRole: seat.role, currentMap: { id: 'map-1' }, viewedMap: { id: 'map-1' } }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'alice', platformRole: 'USER' } }),
}));

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: { emit: vi.fn(), on: vi.fn(), off: vi.fn(), emitInitiativeReorder }, isConnected: true }),
}));

const token = (id: string, name: string): Token => ({
  id, name, characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: name === '',
});

const entry = (tokenId: string, name: string, initiative: number): CombatantEntry => ({
  tokenId, mapId: 'map-1', name, imageUrl: '', initiative, hp: null, type: 'npc', disposition: null, characterId: null,
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
    seat.role = 'GM';
    threeReady();
    render(<InitiativeTracker />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Combatant' }));

    expect(screen.getByRole('dialog', { name: 'Add Combatant' })).toBeInTheDocument();
  });

  // Each choice held a picture whose alt text repeated the name beside it,
  // so it was read as "Orc Orc npc".
  it('names each token in Add Combatant once', () => {
    seat.role = 'GM';
    threeReady();
    useGameStore.getState().setTokens([{ ...token('orc', 'Orc'), imageUrl: '/api/assets/tokens/orc' }]);
    render(<InitiativeTracker />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Combatant' }));

    expect(within(screen.getByRole('dialog', { name: 'Add Combatant' })).getByRole('button', { name: 'Orc NPC' })).toBeInTheDocument();
  });

  it('lets the GM edit a value from a button that says what it holds', () => {
    seat.role = 'GM';
    threeReady();
    render(<InitiativeTracker />);

    fireEvent.click(screen.getByRole('button', { name: 'Initiative for Goblin: 12. Edit' }));

    expect(screen.getByRole('spinbutton', { name: 'Initiative for Goblin' })).toHaveValue(12);
  });

  it('moves a combatant one place down with the arrow key, and says where it went', () => {
    seat.role = 'GM';
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
    seat.role = 'GM';
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
    seat.role = 'GM';
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

  // The GM's Up and Down buttons were drawn on a touch screen only, so with a
  // keyboard nothing on screen said the grip's arrow keys move a combatant.
  // jsdom evaluates no selector of this kind, so the classes are what is
  // checked: the buttons sit over the row's picture, take no room, and show
  // while a button in the row has the keyboard's focus. A click with a mouse
  // gives a button no visible focus, so it brings no arrows.
  describe("the GM's Up and Down buttons with a mouse and a keyboard", () => {
    // The grip is draggable too: the row is the draggable around it.
    const rowOf = (name: string) => screen.getByRole('button', { name: `Move ${name}` }).parentElement?.closest('[draggable]') as HTMLElement;

    it('are in the row, after the grip and before the value, and move the combatant one place', () => {
      seat.role = 'GM';
      threeReady();
      render(<InitiativeTracker />);

      const grip = screen.getByRole('button', { name: 'Move Goblin' });
      const up = within(rowOf('Goblin')).getByRole('button', { name: 'Move Goblin up' });
      const down = within(rowOf('Goblin')).getByRole('button', { name: 'Move Goblin down' });
      const value = screen.getByRole('button', { name: 'Initiative for Goblin: 12. Edit' });
      expect(grip.compareDocumentPosition(up) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(down.compareDocumentPosition(value) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      for (const button of [up, down]) {
        expect(button).toBeEnabled();
        expect(button.tabIndex).toBe(0);
      }

      fireEvent.click(up);
      expect(emitInitiativeReorder).toHaveBeenCalledWith({ orderedTokenIds: ['g', 'h', 'o'] });
      expect(screen.getByRole('status')).toHaveTextContent('Goblin moved to 1 of 3');
      // At the top Up is off, so the cursor goes to the grip, in the same row.
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move Goblin' }));
    });

    it('show only while a button in the row has the keyboard, over the picture, taking no room', () => {
      seat.role = 'GM';
      threeReady();
      render(<InitiativeTracker />);

      const arrows = screen.getByRole('button', { name: 'Move Goblin up' }).parentElement as HTMLElement;
      expect(rowOf('Goblin').className.split(/\s+/)).toContain('group/combatant');
      expect(arrows.className.split(/\s+/)).toEqual(expect.arrayContaining([
        'absolute', 'opacity-0', 'pointer-events-none',
        'group-has-[button:focus-visible]/combatant:opacity-100',
        'group-has-[button:focus-visible]/combatant:pointer-events-auto',
      ]));
    });

    it('go no further than the ends', () => {
      seat.role = 'GM';
      threeReady();
      render(<InitiativeTracker />);

      expect(screen.getByRole('button', { name: 'Move Hero up' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Move Ogre down' })).toBeDisabled();
    });

    it('are not there for a player', () => {
      threeReady();
      render(<InitiativeTracker />);

      expect(screen.queryByRole('button', { name: /^Move .* (up|down)$/ })).toBeNull();
    });
  });

  // The die and the bin were named by their tooltips alone, which say "this
  // token": a screen reader moving through the order heard the same two
  // buttons on every row.
  describe("a combatant's die and bin", () => {
    it("name the combatant for the GM", () => {
      seat.role = 'GM';
      threeReady();
      render(<InitiativeTracker />);

      expect(screen.getByRole('button', { name: 'Roll initiative for Goblin' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove Goblin from initiative' })).toBeInTheDocument();
    });

    it("name a player's own combatant on its die, and give them no bin", () => {
      useGameStore.getState().setTokens([{ ...token('h', 'Hero'), controlledBy: 'alice' }, token('g', 'Goblin')]);
      useGameStore.getState().setCombatState({
        active: false, round: 0, currentTokenId: null,
        combatants: [entry('h', 'Hero', 18), entry('g', 'Goblin', 12)],
      });
      render(<InitiativeTracker />);

      expect(screen.getByRole('button', { name: 'Roll initiative for Hero' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Roll initiative for Goblin/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /from initiative$/ })).toBeNull();
    });
  });
});
