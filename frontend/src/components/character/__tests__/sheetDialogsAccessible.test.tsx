/**
 * The character sheet and its editor reach assistive technology.
 *
 * Both wrapped their dialog in an overlay marked aria-hidden, which removes
 * everything inside it from the accessibility tree: a screen reader found no
 * dialog, no heading and no buttons. These look the dialogs up the way a
 * screen reader does, by role and accessible name, without `hidden: true`.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Character, CampaignMembership } from '@/types';
import CharacterSheetViewerModal from '../CharacterSheetViewerModal';
import CharacterSheetEditorModal from '../CharacterSheetEditorModal';
import { pf2eCharacter } from '@/components/character-sheets/pathfinder2e/__tests__/pf2eFixture';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'owner', platformRole: 'USER' } }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => null,
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/services/api', () => ({
  api: { getUser: vi.fn(), updateCharacter: vi.fn() },
}));
vi.mock('../../character-sheets/dnd5e/DnD5eCharacterView', () => ({
  DnD5eCharacterView: () => <p>sheet</p>,
}));

const character = {
  id: 'char-1', userId: 'owner', name: 'Shadow Assassin', gameSystem: 'DND_5E', data: {}, campaignId: 'camp-1',
} as unknown as Character;
const membership = { userId: 'owner', campaignId: 'camp-1', role: 'PLAYER', characterIds: [] } as unknown as CampaignMembership;

describe('character sheet dialogs', () => {
  it('the sheet is a dialog named after the character', () => {
    render(<CharacterSheetViewerModal character={character} campaignId="camp-1" membership={membership} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Shadow Assassin' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Close dialog' })).toHaveLength(1);
  });

  it('the editor is a dialog named for what it edits', () => {
    const pf2e = pf2eCharacter();
    render(<CharacterSheetEditorModal character={pf2e} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: `Edit Character Sheet: ${pf2e.name}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
