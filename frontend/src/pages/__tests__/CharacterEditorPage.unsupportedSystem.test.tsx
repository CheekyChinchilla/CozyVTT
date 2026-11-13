/**
 * The Character Editor page for a character stored with a game system this
 * build does not have, such as the value of one CozyVTT no longer supports.
 *
 * It offered Save as Template, and the server refuses a template of such a
 * system, so the window ended in a refusal for something the page had
 * offered. It is not offered there now; Export still is.
 */
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CharacterEditorPage from '../CharacterEditorPage';
import type { Character, GameSystem } from '@/types';

const stored = vi.hoisted(() => ({ gameSystem: 'SOMETHING_ELSE' as string | null }));
// One account object, as the real context gives: the page loads the
// character again whenever it changes.
const auth = vi.hoisted(() => ({ user: { id: 'user-1', platformRole: 'USER' } }));

vi.mock('@/hooks/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/queries')>()),
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => auth,
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/components/character/NewCharacterTemplateModal', () => ({ default: () => null }));
vi.mock('@/services/character.service', () => ({
  default: {
    getCharacter: (): Promise<Character> => Promise.resolve({
      id: 'char-1', userId: 'user-1', name: 'Old Hero', gameSystem: stored.gameSystem as GameSystem | null, campaignId: null,
      tokenImageUrl: null, data: { sections: [{ id: 'story', title: 'Story', type: 'text', value: 'Every word of it' }] },
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }),
    updateCharacter: vi.fn(),
    exportCharacterJSON: vi.fn(),
  },
}));

function openPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/characters/char-1/edit']}>
        <Routes>
          <Route path="/characters/:id/edit" element={<CharacterEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  // The page's header, once the character has loaded.
  return screen.findByRole('button', { name: /Export/ });
}

it('offers no Save as Template for a character of an unsupported system, and still offers Export', async () => {
  stored.gameSystem = 'SOMETHING_ELSE';
  await openPage();
  expect(await screen.findByText('Every word of it')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Save as Template/ })).toBeNull();
  expect(screen.getByRole('button', { name: /Export/ })).toBeInTheDocument();
});

it.each([
  ['a Flexible character', null],
  ['a 5E character', 'FIFTH_EDITION'],
  ['a Fantasy d20 character', 'FANTASY_D20'],
  ['a Horror d100 character', 'HORROR_D100'],
])('offers Save as Template for %s', async (_case, gameSystem) => {
  stored.gameSystem = gameSystem;
  await openPage();
  expect(screen.getByRole('button', { name: /Save as Template/ })).toBeInTheDocument();
});
