/**
 * An open sheet follows hit points changed at the table.
 *
 * The roster's +/- buttons change hit points over the socket and announce it
 * as `character.hp.updated`. The open sheet listened only for
 * `character.updated`, so it went on showing the old number, and editing from
 * it started from the old number too.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import type { Character, CampaignMembership } from '@/types';
import CharacterSheetViewerModal from '../CharacterSheetViewerModal';

type Handler = (payload: unknown) => void;
const handlers = new Map<string, Handler>();
const getCharacter = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'dm', platformRole: 'USER' } }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => ({
    socket: {
      emitDiceRoll: vi.fn(),
      emitHitDiceSpend: vi.fn(),
      on: (event: string, handler: Handler) => handlers.set(event, handler),
      off: (event: string) => handlers.delete(event),
    },
  }),
}));
vi.mock('@/services/api', () => ({
  api: {
    getUser: vi.fn().mockResolvedValue({ user: { displayName: 'Owner' } }),
    getCharacter: (id: string) => getCharacter(id),
  },
}));
vi.mock('../../character-sheets/dnd5e/DnD5eCharacterView', () => ({
  DnD5eCharacterView: ({ character }: { character: Character }) => (
    <p>HP {(character.data as { hp: { current: number } }).hp.current}</p>
  ),
}));

const withHp = (current: number, updatedAt: string) =>
  ({
    id: 'char-1', userId: 'owner', name: 'Aldra', gameSystem: 'DND_5E', campaignId: 'camp-1', updatedAt,
    data: { hp: { current, maximum: 20, temporary: 0 } },
  }) as unknown as Character;
const membership = { userId: 'dm', campaignId: 'camp-1', role: 'DM', characterIds: [] } as unknown as CampaignMembership;

describe('CharacterSheetViewerModal and hit points changed at the table', () => {
  it('loads the character again when its hit points change', async () => {
    getCharacter.mockResolvedValue({ character: withHp(12, '2026-01-01T00:00:05.000Z') });
    render(<CharacterSheetViewerModal character={withHp(20, '2026-01-01T00:00:00.000Z')} campaignId="camp-1" membership={membership} onClose={() => {}} />);
    expect(screen.getByText('HP 20')).toBeTruthy();

    act(() => handlers.get('character.hp.updated')?.({ characterId: 'char-1', hp: { current: 12, max: 20, temp: 0 } }));

    await waitFor(() => expect(screen.getByText('HP 12')).toBeTruthy());
    expect(getCharacter).toHaveBeenCalledWith('char-1');
  });

  it('ignores another character', () => {
    getCharacter.mockClear();
    render(<CharacterSheetViewerModal character={withHp(20, '2026-01-01T00:00:00.000Z')} campaignId="camp-1" membership={membership} onClose={() => {}} />);

    act(() => handlers.get('character.hp.updated')?.({ characterId: 'someone-else', hp: { current: 1, max: 20, temp: 0 } }));

    expect(getCharacter).not.toHaveBeenCalled();
  });
});
