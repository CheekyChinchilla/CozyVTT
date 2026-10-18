/**
 * A sheet that cannot be drawn fails inside its own dialog.
 *
 * The sheet viewer and editor drew the sheet with nothing to catch an error,
 * so a sheet the page could not draw replaced the whole app, the DM's map and
 * table included, with the app's error screen. The full-page editor already
 * caught it; these two dialogs now do too.
 */
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { Character, CampaignMembership } from '@/types';
import CharacterSheetViewerModal from '../CharacterSheetViewerModal';
import CharacterSheetEditorModal from '../CharacterSheetEditorModal';

type Handler = (payload: { characterId: string; character?: Character }) => void;
const handlers = new Map<string, Handler>();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'dm', platformRole: 'USER' } }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => ({
    socket: {
      on: (event: string, handler: Handler) => handlers.set(event, handler),
      off: (event: string) => handlers.delete(event),
      rollDice: vi.fn().mockResolvedValue({ ok: true, id: "r" }),
      emitHitDiceSpend: vi.fn(),
    },
  }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/services/api', () => ({
  api: { getUser: vi.fn().mockResolvedValue({ user: { displayName: 'Owner' } }), updateCharacter: vi.fn() },
}));
vi.mock('../../character-sheets/dnd5e/DnD5eCharacterView', () => ({
  DnD5eCharacterView: ({ character }: { character: Character }) => {
    if ((character.data as { broken?: boolean }).broken) throw new Error('This sheet cannot be drawn');
    return <p>The whole sheet</p>;
  },
}));
vi.mock('../../character-sheets/dnd5e/DnD5eCharacterEditor', () => ({
  default: () => {
    throw new Error('This sheet cannot be edited');
  },
}));

const broken = {
  id: 'char-1', userId: 'owner', name: 'Shadow Assassin', gameSystem: 'DND_5E', data: { broken: true },
  campaignId: 'camp-1', updatedAt: '2026-10-01T00:00:00.000Z',
} as unknown as Character;
const membership = { userId: 'dm', campaignId: 'camp-1', role: 'DM', characterIds: [] } as unknown as CampaignMembership;

describe('a sheet that cannot be drawn', () => {
  it('shows an error inside the sheet viewer, which stays open', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CharacterSheetViewerModal character={broken} campaignId="camp-1" membership={membership} onClose={() => {}} />);

    expect(screen.getByText('Error Loading Character Sheet')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Shadow Assassin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
  });

  it('draws the sheet again when a version that can be drawn arrives', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CharacterSheetViewerModal character={broken} campaignId="camp-1" membership={membership} onClose={() => {}} />);
    expect(screen.getByText('Error Loading Character Sheet')).toBeInTheDocument();

    act(() => {
      handlers.get('character.updated')?.({
        characterId: 'char-1',
        character: { ...broken, data: {}, updatedAt: '2026-10-02T00:00:00.000Z' } as unknown as Character,
      });
    });

    expect(screen.getByText('The whole sheet')).toBeInTheDocument();
    expect(screen.queryByText('Error Loading Character Sheet')).toBeNull();
  });

  it('shows an error inside the sheet editor, which stays open', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CharacterSheetEditorModal character={broken} onClose={() => {}} />);

    expect(screen.getByText('Error Loading Character Sheet')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit Character Sheet: Shadow Assassin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
  });
});
