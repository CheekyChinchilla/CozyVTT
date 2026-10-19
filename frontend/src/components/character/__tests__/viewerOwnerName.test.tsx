/**
 * A DM opening a player's sheet saw "Player: Unknown Player". The viewer asked
 * GET /api/users/:id for the owner's name, which answers only the user and an
 * admin. The character as GET /api/characters/:id serves it already names its
 * owner.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { Character, CampaignMembership } from '@/types';
import CharacterSheetViewerModal from '../CharacterSheetViewerModal';

type Handler = (payload: unknown) => void;
const handlers = new Map<string, Handler>();
const getUser = vi.fn().mockRejectedValue(new Error('Forbidden'));

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'dm', platformRole: 'USER' } }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => ({
    socket: {
      rollDice: vi.fn(),
      emitHitDiceSpend: vi.fn(),
      on: (event: string, handler: Handler) => handlers.set(event, handler),
      off: (event: string) => handlers.delete(event),
    },
  }),
}));
vi.mock('@/services/api', () => ({ api: { getUser: (id: string) => getUser(id) } }));
vi.mock('../../character-sheets/dnd5e/DnD5eCharacterView', () => ({
  DnD5eCharacterView: ({ character }: { character: Character }) => <p>Sheet of {character.name}</p>,
}));

const character = {
  id: 'char-1', userId: 'bree-id', name: 'Aldra', gameSystem: 'DND_5E', data: {}, campaignId: 'camp-1',
  updatedAt: '2026-01-01T00:00:00.000Z',
  user: { id: 'bree-id', displayName: 'Bree', avatarUrl: null },
} as unknown as Character;
const membership = { userId: 'dm', campaignId: 'camp-1', role: 'DM', characterIds: [] } as unknown as CampaignMembership;

describe("CharacterSheetViewerModal and the owner's name", () => {
  it("names the player to the DM from the character's owner", async () => {
    render(<CharacterSheetViewerModal character={character} campaignId="camp-1" membership={membership} onClose={() => {}} />);
    expect(await screen.findByText('Player: Bree')).toBeTruthy();
    expect(screen.queryByText(/Unknown Player/)).toBeNull();
  });

  it('keeps the name when a live update carries no owner', async () => {
    render(<CharacterSheetViewerModal character={character} campaignId="camp-1" membership={membership} onClose={() => {}} />);
    const { user: _user, ...withoutOwner } = character;
    act(() => handlers.get('character.updated')?.({
      characterId: 'char-1',
      character: { ...withoutOwner, name: 'Aldra the Bold', updatedAt: '2026-01-01T00:00:05.000Z' },
    }));
    expect(await screen.findByText('Sheet of Aldra the Bold')).toBeTruthy();
    expect(screen.getByText('Player: Bree')).toBeTruthy();
  });
});
