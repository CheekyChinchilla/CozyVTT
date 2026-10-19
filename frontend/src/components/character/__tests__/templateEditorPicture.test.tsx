/**
 * Edit Template offers no token picture.
 *
 * The sheet's picture box uploaded the file as the user's own picture, and a
 * template's picture has to be a global one, so the upload was made and then
 * left unused. The sheets in Edit Template now have no picture box.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import CharacterTemplateEditorModal from '../CharacterTemplateEditorModal';
import { PF2E_BLANK_SHEET } from '@/components/character-sheets/pathfinder2e/__tests__/pf2eFixture';
import { DND5E_SHEET } from '@/components/character-sheets/dnd5e/__tests__/dnd5eFixture';
import { COC_BLANK_SHEET } from '@/components/character-sheets/call-of-cthulhu-7e/__tests__/cocFixture';
import type { CharacterTemplate, GameSystem } from '@/types';

vi.mock('@/hooks/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/queries')>()),
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', platformRole: 'USER' } }),
}));
vi.mock('@/services/api', () => {
  const api = { updateCharacterTemplate: vi.fn(), uploadAsset: vi.fn() };
  return { default: api, api };
});

const sheets: Array<[string, GameSystem | null, Record<string, unknown>]> = [
  ['D&D 5e', 'DND_5E' as GameSystem, DND5E_SHEET],
  ['Pathfinder 2e', 'PATHFINDER_2E' as GameSystem, PF2E_BLANK_SHEET],
  ['Call of Cthulhu', 'CALL_OF_CTHULHU_7E' as GameSystem, COC_BLANK_SHEET],
  ['Flexible', null, { sections: [] }],
];

function template(gameSystem: GameSystem | null, data: Record<string, unknown>): CharacterTemplate {
  return {
    id: 'tpl-1',
    name: 'Level 1 Fighter',
    description: null,
    gameSystem,
    data: JSON.parse(JSON.stringify(data)),
    tokenImageUrl: null,
    createdById: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as CharacterTemplate;
}

// The sheets load on demand; loaded first, no test waits on the import.
beforeAll(async () => {
  await import('@/components/character-sheets/pathfinder2e/Pathfinder2eCharacterSheet');
  await import('@/components/character-sheets/dnd5e/DnD5eCharacterSheet');
  await import('@/components/character-sheets/call-of-cthulhu-7e/CallOfCthulhu7eCharacterSheet');
}, 30_000);

describe.each(sheets)('Edit Template on a %s sheet', (_system, gameSystem, data) => {
  it('has no token picture box', async () => {
    render(<CharacterTemplateEditorModal template={template(gameSystem, data)} onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('button', { name: 'Save' });
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText('Saves as personal token')).toBeNull();
  });
});
