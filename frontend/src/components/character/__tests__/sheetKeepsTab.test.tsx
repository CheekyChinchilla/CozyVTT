/**
 * An open sheet stays on the tab its reader chose when the character changes.
 *
 * Hit points changed at the table, a hit die spent and a save each bring a new
 * version of the character into the open sheet. The sheet shows the new
 * numbers and stays where it was, so a DM watching a player's Combat tab is
 * not sent back to Stats & Skills on every hit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Character, CampaignMembership } from '@/types';
import CharacterSheetViewerModal from '../CharacterSheetViewerModal';
import { dnd5eCharacter } from '../../character-sheets/dnd5e/__tests__/dnd5eFixture';

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
vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/services/api', () => ({
  api: {
    getUser: vi.fn().mockResolvedValue({ user: { displayName: 'Owner' } }),
    getCharacter: (id: string) => getCharacter(id),
  },
}));

const membership = { userId: 'dm', campaignId: 'camp-1', role: 'DM', characterIds: [] } as unknown as CampaignMembership;

/** The fixture character in the campaign, with these hit points, at this version. */
function aldra(current: number, updatedAt: string): Character {
  const character = dnd5eCharacter({ hp: { maximum: 12, current, temporary: 0 } });
  return { ...character, userId: 'owner', campaignId: 'camp-1', updatedAt } as Character;
}

function openOnCombat() {
  render(
    <CharacterSheetViewerModal
      character={aldra(12, '2026-01-01T00:00:00.000Z')}
      campaignId="camp-1"
      membership={membership}
      onClose={() => {}}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Combat' }));
  expect(screen.getByRole('heading', { name: 'Death Saves' })).toBeInTheDocument();
}

describe('the open sheet tab', () => {
  beforeEach(() => {
    handlers.clear();
    getCharacter.mockReset();
  });

  it('stays open when hit points change at the table', async () => {
    getCharacter.mockResolvedValue({ character: aldra(4, '2026-01-01T00:00:05.000Z') });
    openOnCombat();

    await act(async () => {
      handlers.get('character.hp.updated')?.({ characterId: 'char-1', hp: { current: 4, max: 12, temp: 0 } });
    });

    expect(getCharacter).toHaveBeenCalledWith('char-1');
    expect(screen.getByRole('heading', { name: 'Death Saves' })).toBeInTheDocument();
    expect(screen.getByText('4/12')).toBeInTheDocument();
  });

  it('stays open when the character is saved', () => {
    openOnCombat();

    act(() => {
      handlers.get('character.updated')?.({ characterId: 'char-1', character: aldra(7, '2026-01-01T00:00:09.000Z') });
    });

    expect(screen.getByRole('heading', { name: 'Death Saves' })).toBeInTheDocument();
    expect(screen.getByText('7/12')).toBeInTheDocument();
  });
});
