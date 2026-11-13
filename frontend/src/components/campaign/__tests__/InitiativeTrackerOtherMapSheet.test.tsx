/**
 * A combatant's sheet from the initiative tracker, whatever map its token is on.
 *
 * The tracker found a combatant's character through the token on the map on
 * screen, so a combatant on another map had no menu at all: one on a map the
 * GM is preparing, or one on the table's map while the GM prepares another.
 * The order now names each combatant's character as the server lets this
 * viewer know it, and View Character Sheet opens it from there. Roll... still
 * needs the token itself, so it stays with the map on screen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InitiativeTracker from '../InitiativeTracker';
import { useGameStore } from '@/stores/gameStore';
import type { CombatantEntry, Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

const token = (id: string, name: string, extra: Partial<Token> = {}): Token => ({
  id, name, characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: false,
  ...extra,
});

const seat = vi.hoisted(() => ({
  role: 'GM',
  viewedMapId: 'map-prepared',
  tableTokens: [] as Token[],
}));
const getCharacter = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    userRole: seat.role,
    currentMap: { id: 'map-table', tokens: seat.tableTokens },
    viewedMap: { id: seat.viewedMapId },
    campaign: {
      id: 'camp-1',
      gameSystem: 'FIFTH_EDITION',
      characters: [{ id: 'char-aldra', userId: 'player' }, { id: 'char-mira', userId: 'dm' }],
      memberships: [{ userId: 'dm', role: 'GM' }, { userId: 'player', role: 'PLAYER' }],
    },
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: seat.role === 'GM' ? 'dm' : 'player', platformRole: 'USER' } }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }, isConnected: true }),
}));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/services/api', () => ({ api: { getCharacter } }));

// The viewer says which sheet it opened, and how a roll from it would go out.
vi.mock('@/components/character/CharacterSheetViewerModal', () => ({
  default: ({ character, publicName, secretRolls }: { character: { id: string }; publicName?: string; secretRolls?: boolean }) => (
    <div role="dialog" aria-label={`Sheet of ${character.id}`}>
      {`named ${publicName ?? 'by the sheet'}, ${secretRolls ? 'to the GM alone' : 'to the table'}`}
    </div>
  ),
}));

const entry = (tokenId: string, name: string, mapId: string, characterId: string | null): CombatantEntry => ({
  tokenId, mapId, name, imageUrl: '', initiative: 10, hp: null, type: 'player', disposition: null, characterId,
});

const menuItem = (name: string) => screen.queryByRole('button', { name });

beforeEach(() => {
  seat.role = 'GM';
  seat.viewedMapId = 'map-prepared';
  seat.tableTokens = [token('aldra', 'Aldra', { characterId: 'char-aldra', type: TokenType.PLAYER, controlledBy: 'player' })];
  getCharacter.mockReset();
  getCharacter.mockImplementation(async (id: string) => ({ character: { id } }));
  // The map on screen is the one being prepared, with a creature of its own.
  useGameStore.getState().setTokens([token('lurker', 'Crypt Lurker')]);
});

function fight(...combatants: CombatantEntry[]) {
  useGameStore.getState().setCombatState({ active: false, round: 0, currentTokenId: null, combatants });
}

describe("a combatant whose token is on the table's map, while the GM prepares another", () => {
  it('offers its character sheet and no rolls', async () => {
    fight(entry('aldra', 'Aldra', 'map-table', 'char-aldra'));
    render(<InitiativeTracker />);

    fireEvent.contextMenu(screen.getByText('Aldra'));
    expect(menuItem('Roll...')).not.toBeInTheDocument();
    fireEvent.click(menuItem('View Character Sheet')!);

    expect(await screen.findByRole('dialog', { name: 'Sheet of char-aldra' })).toHaveTextContent('named by the sheet, to the table');
    expect(getCharacter).toHaveBeenCalledWith('char-aldra');
  });

  it("names a roll from the sheet as the map would: not at all for a hidden token", async () => {
    seat.tableTokens = [token('mira', 'Mira', { characterId: 'char-mira', visible: false })];
    fight(entry('mira', 'Mira', 'map-table', 'char-mira'));
    render(<InitiativeTracker />);

    fireEvent.doubleClick(screen.getByText('Mira'));

    expect(await screen.findByRole('dialog', { name: 'Sheet of char-mira' })).toHaveTextContent('named Unknown creature, to the table');
  });
});

describe('a combatant whose token is on a map the table is not on', () => {
  it('opens its character sheet, whose rolls go to the GM alone', async () => {
    seat.viewedMapId = 'map-table';
    useGameStore.getState().setTokens(seat.tableTokens);
    fight(entry('mira', 'Mira', 'map-prepared', 'char-mira'));
    render(<InitiativeTracker />);

    fireEvent.contextMenu(screen.getByText('Mira'));
    expect(menuItem('Roll...')).not.toBeInTheDocument();
    fireEvent.click(menuItem('View Character Sheet')!);

    expect(await screen.findByRole('dialog', { name: 'Sheet of char-mira' })).toHaveTextContent('to the GM alone');
  });
});

describe('a combatant on another map with no sheet to open', () => {
  it.each([
    ['a creature', null],
    ['a character that has left the campaign', 'char-gone'],
  ])('offers nothing for %s', (_what, characterId) => {
    fight(entry('far', 'Far Away', 'map-table', characterId));
    render(<InitiativeTracker />);

    const unhandled = fireEvent.contextMenu(screen.getByText('Far Away'));

    expect(unhandled).toBe(true);
    expect(menuItem('View Character Sheet')).not.toBeInTheDocument();
  });
});

describe('a player', () => {
  // A player is sent the combatants of the table's map. On a map with
  // lighting the order lists one out of their sight, whose token their map is
  // not sent, and names no character for it, so there is no sheet to open.
  it('has nothing to open on a combatant out of their sight, whose character the order does not name', () => {
    seat.role = 'PLAYER';
    seat.viewedMapId = 'map-table';
    useGameStore.getState().setTokens([]);
    fight(entry('mira', 'Mira', 'map-table', null));
    render(<InitiativeTracker />);

    const unhandled = fireEvent.contextMenu(screen.getByText('Mira'));

    expect(unhandled).toBe(true);
    expect(menuItem('View Character Sheet')).not.toBeInTheDocument();
  });

  it('opens the sheet of a combatant the order names, with no rolls', async () => {
    seat.role = 'PLAYER';
    seat.viewedMapId = 'map-table';
    useGameStore.getState().setTokens([token('mira', 'Mira', { characterId: 'char-mira' })]);
    fight(entry('mira', 'Mira', 'map-table', 'char-mira'));
    render(<InitiativeTracker />);

    fireEvent.contextMenu(screen.getByText('Mira'));
    expect(menuItem('Roll...')).not.toBeInTheDocument();
    fireEvent.click(menuItem('View Character Sheet')!);

    expect(await screen.findByRole('dialog', { name: 'Sheet of char-mira' })).toBeInTheDocument();
  });
});
