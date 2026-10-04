/**
 * A sheet tells whoever opened it about the character it loaded again after
 * its editor closed, so a page holding its own copy can show the stored one.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Character, CampaignMembership } from '@/types';
import CharacterSheetViewerModal from '../CharacterSheetViewerModal';

const character = {
  id: 'char-1', userId: 'owner', name: 'Sheet A', gameSystem: 'DND_5E', data: { background: 'Sage' }, campaignId: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Character;
const stored = { ...character, data: { background: 'Scholar' }, updatedAt: '2026-01-01T00:00:09.000Z' } as unknown as Character;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'owner', platformRole: 'USER' } }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => null,
}));
vi.mock('@/services/api', () => ({
  api: { getUser: vi.fn(), getCharacter: () => Promise.resolve({ character: stored }) },
}));
vi.mock('../../character-sheets/dnd5e/DnD5eCharacterView', () => ({
  DnD5eCharacterView: ({ onEdit }: { onEdit?: () => void }) => (
    <button type="button" onClick={onEdit}>Edit</button>
  ),
}));
// The editor reports a save, or a save refused as out of date, by calling
// onSaved before it closes.
vi.mock('../CharacterSheetEditorModal', () => ({
  default: ({ onSaved, onClose }: { onSaved?: () => void; onClose: () => void }) => (
    <button type="button" onClick={() => { onSaved?.(); onClose(); }}>Editor saves</button>
  ),
}));

const membership = undefined as unknown as CampaignMembership;

describe('CharacterSheetViewerModal after its editor closes', () => {
  it('passes on the character as stored', async () => {
    const onCharacterChanged = vi.fn();
    render(
      <CharacterSheetViewerModal
        character={character}
        membership={membership}
        onClose={() => {}}
        onCharacterChanged={onCharacterChanged}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Editor saves' }));

    await waitFor(() => expect(onCharacterChanged).toHaveBeenCalledWith(stored));
  });
});
