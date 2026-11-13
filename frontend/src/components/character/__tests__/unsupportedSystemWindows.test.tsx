/**
 * The sheet window and the editor window, for a character stored with a game
 * system this build does not have, such as the value of one CozyVTT no longer
 * supports, and the template editor for a template stored so. Each shows the
 * line saying why, naming a character or a template as it is one, and the
 * data as a Flexible sheet that cannot be changed: the server refuses to save
 * it.
 */
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CampaignRole, type CampaignMembership, type Character, type CharacterTemplate, type GameSystem } from '@/types';
import CharacterSheetViewerModal from '../CharacterSheetViewerModal';
import CharacterSheetEditorModal from '../CharacterSheetEditorModal';
import CharacterTemplateEditorModal from '../CharacterTemplateEditorModal';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', platformRole: 'USER' } }) }));
vi.mock('@/contexts/WebSocketContext', () => ({ useOptionalWebSocket: () => null }));
vi.mock('@/services/api', () => ({
  api: { getUser: vi.fn().mockResolvedValue({ user: { displayName: 'Owner' } }), updateCharacter: vi.fn() },
}));

const CODE = 'SOMETHING_ELSE';
const NOTICE = 'This character was made for a game system CozyVTT no longer supports. Its data is kept; you can export or delete it.';
const TEMPLATE_NOTICE = 'This template was made for a game system CozyVTT no longer supports. Its data is kept; you can delete it.';

const character: Character = {
  id: 'char-1', userId: 'owner', name: 'Old Hero', gameSystem: CODE as GameSystem, campaignId: 'camp-1', tokenImageUrl: null,
  data: { sections: [{ id: 'story', title: 'Story', type: 'text', value: 'Every word of it' }] },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};
const membership: CampaignMembership = {
  id: 'm-1', userId: 'owner', campaignId: 'camp-1', role: CampaignRole.PLAYER, characterIds: ['char-1'], joinedAt: '2026-01-01T00:00:00.000Z',
};

it('the sheet window shows the line, the data, and no Edit, never the code', () => {
  render(<CharacterSheetViewerModal character={character} campaignId="camp-1" membership={membership} onClose={() => {}} />);

  expect(screen.getByText(NOTICE)).toBeTruthy();
  expect(screen.getByText('Every word of it')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull();
  expect(screen.getByText('Unsupported system')).toBeTruthy();
  expect(screen.queryByText(CODE)).toBeNull();
});

it('the editor window shows the line and the data, with nothing to save', () => {
  render(<CharacterSheetEditorModal character={character} onClose={() => {}} />);

  expect(screen.getByText(NOTICE)).toBeTruthy();
  expect(screen.getByText('Every word of it')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save', hidden: true })).toBeNull();
});

// A template has no Export, and its notice is not the character's.
it('the template editor window shows the line for a template, and the data, with nothing to save', () => {
  const template: CharacterTemplate = {
    id: 'tpl-1', name: 'Old Ranger', description: null, gameSystem: CODE as GameSystem, tokenImageUrl: null, createdById: 'owner',
    createdBy: null, data: character.data, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
  render(<CharacterTemplateEditorModal template={template} onClose={() => {}} onSaved={() => {}} />);

  expect(screen.getByText(TEMPLATE_NOTICE)).toBeTruthy();
  expect(screen.queryByText(NOTICE)).toBeNull();
  expect(screen.getByText('Every word of it')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save', hidden: true })).toBeNull();
});
