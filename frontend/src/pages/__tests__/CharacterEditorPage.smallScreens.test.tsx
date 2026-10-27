/**
 * The Character Editor page on a phone.
 *
 * Its header kept the back button and "Editing:" with the name beside the
 * save status, Save as Template and Export on one line, so on a phone the page
 * was wider than the screen, by more while "Saved" and the time showed. The
 * row now wraps, the buttons going under the name where the line is too narrow
 * for both. The page, its loading, error and refused states included, is as
 * tall as the browser shows it (`min-h-dvh`), toolbar or not.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CharacterEditorPage from '../CharacterEditorPage';
import source from '../CharacterEditorPage.tsx?raw';
import { pf2eCharacter } from '@/components/character-sheets/pathfinder2e/__tests__/pf2eFixture';

const auth = { user: { id: 'user-1', platformRole: 'USER' } };

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
  default: { getCharacter: () => Promise.resolve(pf2eCharacter()), updateCharacter: vi.fn(), exportCharacterJSON: vi.fn() },
}));

const classes = (element: Element | null) => (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

/** The nearest element holding both. */
function around(a: Element, b: Element): Element {
  let at: Element | null = a;
  while (at && !at.contains(b)) at = at.parentElement;
  if (!at) throw new Error('no element holds both');
  return at;
}

describe('the Character Editor page on a phone', () => {
  it('wraps its header, the buttons going under the name', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/characters/char-1/edit']}>
          <Routes>
            <Route path="/characters/:id/edit" element={<CharacterEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    const title = await screen.findByRole('heading', { name: /^Editing:/ });
    const row = around(title, screen.getByRole('button', { name: /Export/ }));
    expect(classes(row)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-x-4', 'gap-y-3']));
  });

  it('is as tall as the browser shows it, in every state', () => {
    expect(source.match(/\bmin-h-screen\b/g) ?? []).toEqual([]);
    expect(source.match(/\bmin-h-dvh\b/g)).toHaveLength(4);
  });
});
