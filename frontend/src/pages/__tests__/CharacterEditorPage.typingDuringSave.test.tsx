/**
 * Typing while the full-page editor saves.
 *
 * The page went back to the read-only sheet once the save finished, dropping
 * what had been typed meanwhile, and was then left saying there were unsaved
 * changes with nothing on screen to save. It now stays in the editor with
 * that text, and the next save is made from the version just saved.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CharacterEditorPage from '../CharacterEditorPage';
import { dnd5eCharacter } from '@/components/character-sheets/dnd5e/__tests__/dnd5eFixture';
import type { Character } from '@/types';

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
  default: { getCharacter: vi.fn(), updateCharacter: vi.fn(), exportCharacterJSON: vi.fn() },
}));

import characterService from '@/services/character.service';

const getCharacter = characterService.getCharacter as ReturnType<typeof vi.fn>;
const updateCharacter = characterService.updateCharacter as ReturnType<typeof vi.fn>;

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/characters/char-1/edit']}>
        <Routes>
          <Route path="/characters/:id/edit" element={<CharacterEditorPage />} />
          <Route path="/characters" element={<p>Character list</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// The sheet loads on demand. Loaded here first, the first test does not wait
// on the import, which on a busy machine outlasted the default wait.
beforeAll(async () => {
  await import('@/components/character-sheets/dnd5e/DnD5eCharacterSheet');
}, 30_000);

beforeEach(() => {
  getCharacter.mockReset().mockResolvedValue(dnd5eCharacter());
  updateCharacter.mockReset();
});

describe('typing during a full-page save', () => {
  it('keeps the text in the editor, asks before leaving, and saves it from the new version', async () => {
    let finish: (saved: Character) => void = () => {};
    updateCharacter.mockImplementationOnce(() => new Promise<Character>((resolve) => { finish = resolve; }));
    renderPage();

    const name = await screen.findByPlaceholderText('Character Name');
    fireEvent.change(name, { target: { value: 'Aldra the Bold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText('Character Name'), { target: { value: 'Aldra the Bolder' } });
    await act(async () =>
      finish({ ...dnd5eCharacter({ characterName: 'Aldra the Bold' }), updatedAt: '2026-01-01T00:00:09.000Z' })
    );

    expect(screen.getByPlaceholderText('Character Name')).toHaveValue('Aldra the Bolder');

    fireEvent.click(screen.getByRole('button', { name: 'Back to characters' }));
    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));

    updateCharacter.mockResolvedValueOnce({
      ...dnd5eCharacter({ characterName: 'Aldra the Bolder' }), updatedAt: '2026-01-01T00:00:12.000Z',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(2));

    const second = updateCharacter.mock.calls[1][1] as { updatedAt?: string; data: { characterName?: string } };
    expect(second.updatedAt).toBe('2026-01-01T00:00:09.000Z');
    expect(second.data.characterName).toBe('Aldra the Bolder');
  });
});
