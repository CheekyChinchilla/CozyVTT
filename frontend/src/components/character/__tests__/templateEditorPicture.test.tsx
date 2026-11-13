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
import { FANTASY_D20_BLANK_SHEET } from '@/components/character-sheets/fantasy-d20/__tests__/fantasyD20Fixture';
import { FIFTH_EDITION_SHEET } from '@/components/character-sheets/fifth-edition/__tests__/fifthEditionFixture';
import { blankSheet } from '@/components/character-sheets/horror-d100/__tests__/sheetFixture';
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
  ['5E', 'FIFTH_EDITION' as GameSystem, FIFTH_EDITION_SHEET],
  ['Fantasy d20', 'FANTASY_D20' as GameSystem, FANTASY_D20_BLANK_SHEET],
  ['Horror d100', 'HORROR_D100' as GameSystem, { ...blankSheet() }],
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
  await import('@/components/character-sheets/fantasy-d20/FantasyD20CharacterSheet');
  await import('@/components/character-sheets/fifth-edition/FifthEditionCharacterSheet');
  await import('@/components/character-sheets/horror-d100/HorrorD100CharacterSheet');
}, 30_000);

describe.each(sheets)('Edit Template on a %s sheet', (_system, gameSystem, data) => {
  it('has no token picture box', async () => {
    render(<CharacterTemplateEditorModal template={template(gameSystem, data)} onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('button', { name: 'Save' });
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText('Saves as personal token')).toBeNull();
  });
});
