/**
 * A combatant's sheet and rolls, from the initiative tracker.
 *
 * Right-clicking a row offers what right-clicking the token on the map
 * offers about its character: View Character Sheet to any member, Roll... to
 * whoever may roll that character, and the DM a creature's Roll.... Double-
 * clicking a character's row opens its sheet. The name is a button, so the
 * menu opens from the keyboard too.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InitiativeTracker from '../InitiativeTracker';
import { useGameStore } from '@/stores/gameStore';
import type { CombatantEntry, Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

const seat = vi.hoisted(() => ({ role: 'PLAYER' }));
const getCharacter = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    userRole: seat.role,
    currentMap: { id: 'map-1' },
    campaign: {
      id: 'camp-1',
      gameSystem: 'DND_5E',
      characters: [{ id: 'char-alice', userId: 'alice' }, { id: 'char-bob', userId: 'bob' }],
      memberships: [{ userId: 'alice', role: seat.role }],
    },
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'alice', platformRole: 'USER' } }),
}));

vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    socket: { emit: vi.fn(), on: vi.fn(), off: vi.fn(), emitInitiativeRoll: vi.fn(), emitHitDiceSpend: vi.fn() },
    isConnected: true,
  }),
}));

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

vi.mock('@/services/api', () => ({ api: { getCharacter } }));

vi.mock('@/components/character/CharacterSheetViewerModal', () => ({
  default: ({ character }: { character: { id: string } }) => <div role="dialog" aria-label={`Sheet of ${character.id}`} />,
}));

vi.mock('@/components/campaign/CharacterRollPicker', () => ({
  default: ({ characterId }: { characterId: string }) => <div data-testid="character-rolls">{characterId}</div>,
}));

vi.mock('@/components/campaign/NpcRollPicker', () => ({
  default: ({ token }: { token: { id: string } }) => <div data-testid="creature-rolls">{token.id}</div>,
}));

const token = (id: string, name: string, extra: Partial<Token> = {}): Token => ({
  id, name, characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: false,
  ...extra,
});

const entry = (tokenId: string, name: string, type: CombatantEntry['type'], mapId = 'map-1'): CombatantEntry => ({
  tokenId, mapId, name, imageUrl: '', initiative: 10, hp: null, type, disposition: null,
});

beforeEach(() => {
  seat.role = 'PLAYER';
  getCharacter.mockReset();
  getCharacter.mockImplementation(async (id: string) => ({ character: { id } }));
  useGameStore.getState().setTokens([
    token('pa', 'Alice', { type: TokenType.PLAYER, characterId: 'char-alice', controlledBy: 'alice' }),
    token('pb', 'Bob', { type: TokenType.PLAYER, characterId: 'char-bob', controlledBy: 'bob' }),
    token('g', 'Goblin'),
  ]);
  useGameStore.getState().setCombatState({
    active: false, round: 0, currentTokenId: null,
    combatants: [entry('pa', 'Alice', 'player'), entry('pb', 'Bob', 'player'), entry('g', 'Goblin', 'npc')],
  });
});

const menuItem = (name: string) => screen.queryByRole('button', { name });

describe("a combatant's right-click menu", () => {
  it("offers a player their own character's sheet and rolls", async () => {
    render(<InitiativeTracker />);

    fireEvent.contextMenu(screen.getByText('Alice'));
    expect(menuItem('View Character Sheet')).toBeInTheDocument();
    fireEvent.click(menuItem('Roll...')!);

    expect(screen.getByTestId('character-rolls')).toHaveTextContent('char-alice');
  });

  it("opens the sheet of another player's character, with no rolls", async () => {
    render(<InitiativeTracker />);

    fireEvent.contextMenu(screen.getByText('Bob'));
    expect(menuItem('Roll...')).not.toBeInTheDocument();
    fireEvent.click(menuItem('View Character Sheet')!);

    expect(await screen.findByRole('dialog', { name: 'Sheet of char-bob' })).toBeInTheDocument();
    expect(getCharacter).toHaveBeenCalledWith('char-bob');
  });

  it("leaves a player's right-click on a creature to the browser", () => {
    render(<InitiativeTracker />);

    const unhandled = fireEvent.contextMenu(screen.getByText('Goblin'));

    expect(unhandled).toBe(true);
    expect(menuItem('Roll...')).not.toBeInTheDocument();
  });

  it("offers the DM a creature's rolls", () => {
    seat.role = 'DM';
    render(<InitiativeTracker />);

    fireEvent.contextMenu(screen.getByText('Goblin'));
    expect(menuItem('View Character Sheet')).not.toBeInTheDocument();
    fireEvent.click(menuItem('Roll...')!);

    expect(screen.getByTestId('creature-rolls')).toHaveTextContent('g');
  });

  it('offers nothing for a combatant whose token is on another map', () => {
    useGameStore.getState().setCombatState({
      active: false, round: 0, currentTokenId: null,
      combatants: [entry('far', 'Carol', 'player', 'map-2')],
    });
    render(<InitiativeTracker />);

    const unhandled = fireEvent.contextMenu(screen.getByText('Carol'));

    expect(unhandled).toBe(true);
    expect(menuItem('View Character Sheet')).not.toBeInTheDocument();
  });
});

describe('double-clicking a combatant', () => {
  it("opens a character's sheet", async () => {
    render(<InitiativeTracker />);

    fireEvent.doubleClick(screen.getByText('Alice'));

    expect(await screen.findByRole('dialog', { name: 'Sheet of char-alice' })).toBeInTheDocument();
  });

  it('does nothing on a creature', () => {
    seat.role = 'DM';
    render(<InitiativeTracker />);

    fireEvent.doubleClick(screen.getByText('Goblin'));

    expect(getCharacter).not.toHaveBeenCalled();
  });

  it("leaves the DM's initiative value to its own editing", () => {
    seat.role = 'DM';
    render(<InitiativeTracker />);

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Initiative for Alice: 10. Edit' }));

    expect(getCharacter).not.toHaveBeenCalled();
  });
});

describe('the menu from the keyboard', () => {
  it("opens from the combatant's name and takes the cursor", async () => {
    render(<InitiativeTracker />);

    // A keyboard press on a button is a click with no mouse button count.
    fireEvent.click(screen.getByRole('button', { name: 'Alice' }), { detail: 0 });

    await waitFor(() => expect(document.activeElement).toBe(menuItem('View Character Sheet')));
  });

  it('gives the cursor back to the name when closed with Escape', async () => {
    render(<InitiativeTracker />);
    const name = screen.getByRole('button', { name: 'Alice' });

    fireEvent.click(name, { detail: 0 });
    await waitFor(() => expect(document.activeElement).toBe(menuItem('View Character Sheet')));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(menuItem('View Character Sheet')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(name);
  });

  it('does not open on a single mouse click', () => {
    render(<InitiativeTracker />);

    fireEvent.click(screen.getByRole('button', { name: 'Alice' }), { detail: 1 });

    expect(menuItem('View Character Sheet')).not.toBeInTheDocument();
  });
});
