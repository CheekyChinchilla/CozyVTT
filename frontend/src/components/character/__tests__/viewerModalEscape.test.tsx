/**
 * Escape in a character sheet with its editor open over it.
 *
 * Both listen for Escape on the whole page, so one press closed the editor
 * and the sheet behind it together. Only the top one answers now.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Character, CampaignMembership } from '@/types';
import CharacterSheetViewerModal from '../CharacterSheetViewerModal';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'owner', platformRole: 'USER' } }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => null,
}));
vi.mock('@/services/api', () => ({
  api: { getUser: vi.fn() },
}));
vi.mock('../CharacterSheetEditorModal', () => ({
  default: () => <div role="dialog" aria-label="Editor stand-in" />,
}));
vi.mock('../../character-sheets/dnd5e/DnD5eCharacterView', () => ({
  DnD5eCharacterView: ({ onEdit }: { onEdit?: () => void }) => (
    <button type="button" onClick={onEdit}>Edit</button>
  ),
}));

const character = {
  id: 'char-1', userId: 'owner', name: 'Shadow Assassin', gameSystem: 'DND_5E', data: {}, campaignId: 'camp-1',
} as unknown as Character;
const membership = { userId: 'owner', campaignId: 'camp-1', role: 'PLAYER', characterIds: [] } as unknown as CampaignMembership;

describe('Escape in a character sheet', () => {
  it('leaves the sheet open while its editor is open', async () => {
    const onClose = vi.fn();
    render(<CharacterSheetViewerModal character={character} campaignId="camp-1" membership={membership} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('dialog', { name: 'Editor stand-in' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
  });

  it('still closes the sheet when no editor is open', async () => {
    const onClose = vi.fn();
    render(<CharacterSheetViewerModal character={character} campaignId="camp-1" membership={membership} onClose={onClose} />);

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });
});
