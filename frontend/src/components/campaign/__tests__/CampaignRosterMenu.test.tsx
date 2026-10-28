/**
 * A roster character's menu, as each viewer is shown it: its items in
 * order, their icons and how they look (test/characterMenuRows.ts), and what
 * each does. These pin the menu as it is, so a change to how it is built
 * shows as a change here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { CampaignRole, type RosterMember } from '@/types';
import { useGameStore } from '@/stores/gameStore';
import { characterMenuRows, openCharacterMenu } from '@/test/characterMenuRows';

const h = vi.hoisted(() => ({
  seat: { role: 'DM', userId: 'dm' },
  currentMap: { id: 'map-1', width: 20, height: 20 } as { id: string; width: number; height: number } | null,
  api: {
    getCampaignCharacters: vi.fn(),
    getCharacter: vi.fn(),
    assignCharacterToCampaign: vi.fn(),
    addToken: vi.fn(),
  },
}));

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'c1', memberships: [{ userId: h.seat.userId, role: h.seat.role }] },
    currentMap: h.currentMap,
    userRole: h.seat.role,
  }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: { on: vi.fn(), off: vi.fn() } }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: h.seat.userId } }) }));
vi.mock('@/services/api', () => ({ api: h.api, default: h.api }));
vi.mock('../../character/CharacterSheetViewerModal', () => ({
  default: ({ character }: { character: { id: string } }) => <div role="dialog" aria-label={`Sheet of ${character.id}`} />,
}));
vi.mock('../../character/CharacterSheetEditorModal', () => ({
  default: ({ character }: { character: { id: string } }) => <div role="dialog" aria-label={`Editor of ${character.id}`} />,
}));
vi.mock('../CharacterRollPicker', () => ({
  default: ({ characterId, anchorX, anchorY }: { characterId: string; anchorX: number; anchorY: number }) =>
    <div data-testid="character-rolls">{`${characterId} at ${anchorX}, ${anchorY}`}</div>,
}));

import CampaignRoster from '../CampaignRoster';
import { LayoutProvider } from '@/contexts/LayoutContext';

const member = (userId: string, userName: string, role: CampaignRole): RosterMember => ({
  userId, userName, userAvatar: null, role, joinedAt: '2026-10-01T00:00:00.000Z',
  characters: role === CampaignRole.DM ? [] : [{
    id: `${userId}-char`, name: `${userName}'s hero`, tokenImageUrl: null, gameSystem: null, userId, hp: { current: 7, max: 10, temp: 0 },
  }],
});

beforeEach(() => {
  h.seat.role = 'DM';
  h.seat.userId = 'dm';
  h.currentMap = { id: 'map-1', width: 20, height: 20 };
  h.api.getCampaignCharacters.mockReset().mockResolvedValue({
    roster: [member('dm', 'Mara', CampaignRole.DM), member('p1', 'Ash', CampaignRole.PLAYER), member('p2', 'Bea', CampaignRole.PLAYER)],
  });
  h.api.getCharacter.mockReset().mockImplementation(async (id: string) => ({ character: { id } }));
  h.api.assignCharacterToCampaign.mockReset().mockResolvedValue({});
  h.api.addToken.mockReset().mockImplementation(async () => ({ token: { id: 'tok-new' } }));
  useGameStore.getState().clearGameState();
});

async function rightClick(name: string) {
  fireEvent.contextMenu(await screen.findByText(name), { clientX: 40, clientY: 60 });
}

const EVERY_ITEM = [
  '[eye] View Character Sheet',
  '[dices] Roll...',
  '[square-pen] Edit Character Sheet',
  '[map-pin] Add to Map',
  '[x] Remove from Campaign (danger)',
];

describe("a roster character's menu", () => {
  it("offers the DM everything on a player's character", async () => {
    render(<CampaignRoster />);
    await rightClick("Ash's hero");

    expect(characterMenuRows()).toEqual(EVERY_ITEM);
    expect(openCharacterMenu()!.getAttribute('style')).toBe('left: 40px; top: 60px; visibility: visible;');
  });

  it('offers the DM no Add to Map with no map showing', async () => {
    h.currentMap = null;
    render(<CampaignRoster />);
    await rightClick("Ash's hero");

    expect(characterMenuRows()).toEqual(EVERY_ITEM.filter((r) => !r.includes('Add to Map')));
  });

  it('offers a player all but Add to Map on their own character', async () => {
    h.seat = { role: 'PLAYER', userId: 'p1' };
    render(<CampaignRoster />);
    await rightClick("Ash's hero");

    expect(characterMenuRows()).toEqual(EVERY_ITEM.filter((r) => !r.includes('Add to Map')));
  });

  it("offers a player the sheet alone on another player's character", async () => {
    h.seat = { role: 'PLAYER', userId: 'p1' };
    render(<CampaignRoster />);
    await rightClick("Bea's hero");

    expect(characterMenuRows()).toEqual(['[eye] View Character Sheet']);
  });

  it('offers a spectator the sheet and Remove from Campaign on their own character, and the sheet alone on another', async () => {
    h.seat = { role: 'SPECTATOR', userId: 'p1' };
    render(<CampaignRoster />);
    await rightClick("Ash's hero");
    expect(characterMenuRows()).toEqual(['[eye] View Character Sheet', '[x] Remove from Campaign (danger)']);
    fireEvent.mouseDown(document.body);

    await rightClick("Bea's hero");
    expect(characterMenuRows()).toEqual(['[eye] View Character Sheet']);
  });
});

describe("what a roster character's menu items do", () => {
  async function choose(label: string) {
    render(<CampaignRoster />);
    await rightClick("Ash's hero");
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: label })); });
    return openCharacterMenu() === null;
  }

  it('View Character Sheet opens the sheet and closes the menu', async () => {
    expect(await choose('View Character Sheet')).toBe(true);
    expect(await screen.findByRole('dialog', { name: 'Sheet of p1-char' })).toBeInTheDocument();
  });

  it('Roll... opens the roll picker at the menu’s point and closes the menu', async () => {
    expect(await choose('Roll...')).toBe(true);
    expect(screen.getByTestId('character-rolls')).toHaveTextContent('p1-char at 40, 60');
  });

  it('Edit Character Sheet opens the editor and closes the menu', async () => {
    expect(await choose('Edit Character Sheet')).toBe(true);
    expect(await screen.findByRole('dialog', { name: 'Editor of p1-char' })).toBeInTheDocument();
  });

  it('Add to Map places the character at the middle of the map and closes the menu', async () => {
    expect(await choose('Add to Map')).toBe(true);
    expect(h.api.addToken).toHaveBeenCalledWith('c1', 'map-1', expect.objectContaining({ characterId: 'p1-char', position: { x: 10, y: 10 } }));
  });

  it('Remove from Campaign asks first and closes the menu', async () => {
    expect(await choose('Remove from Campaign')).toBe(true);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(h.api.assignCharacterToCampaign).not.toHaveBeenCalled();
  });
});

describe("a roster character's menu on the compact layout", () => {
  it('is an action sheet named by the character, with the same items', async () => {
    render(<LayoutProvider compact><CampaignRoster /></LayoutProvider>);
    await rightClick("Ash's hero");

    const sheet = screen.getByRole('dialog', { name: "Ash's hero" });
    expect(within(sheet).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'View Character Sheet', 'Roll...', 'Edit Character Sheet', 'Add to Map', 'Remove from Campaign', 'Cancel',
    ]);
    expect(openCharacterMenu()).toBeNull();
  });
});
