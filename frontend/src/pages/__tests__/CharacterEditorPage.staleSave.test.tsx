/**
 * A save from the full-page Character Editor refused because the character
 * changed after the page loaded it.
 *
 * The page has no live connection, so hit points changed at the table, or an
 * edit saved from another window, make its next save stale. It used to load
 * the newer version over the editor and throw away what was typed. It now
 * keeps the editor and the edits, carries them onto the newest version, says
 * what it carried, and saves when told to.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CharacterEditorPage from '../CharacterEditorPage';
import { dnd5eCharacter } from '@/components/character-sheets/dnd5e/__tests__/dnd5eFixture';
import { queryKeys } from '@/hooks/queries';
import type { Character } from '@/types';

const showToast = vi.fn();
const auth = { user: { id: 'user-1', platformRole: 'USER' } };

vi.mock('@/hooks/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/queries')>()),
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => auth,
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));
vi.mock('@/components/character/NewCharacterTemplateModal', () => ({ default: () => null }));
vi.mock('@/services/character.service', () => ({
  default: { getCharacter: vi.fn(), updateCharacter: vi.fn(), exportCharacterJSON: vi.fn() },
}));

import characterService from '@/services/character.service';

const getCharacter = characterService.getCharacter as ReturnType<typeof vi.fn>;
const updateCharacter = characterService.updateCharacter as ReturnType<typeof vi.fn>;
const stale = { response: { status: 409, data: { error: 'Conflict', code: 'CHARACTER_CHANGED', message: 'changed' } } };

const latest: Character = { ...dnd5eCharacter({ hp: { maximum: 12, current: 7, temporary: 0 } }), updatedAt: '2026-01-01T00:00:05.000Z' };
const saved: Character = {
  ...dnd5eCharacter({ characterName: 'Aldra the Bold', hp: { maximum: 12, current: 7, temporary: 0 } }),
  updatedAt: '2026-01-01T00:00:09.000Z',
};

function renderPage(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/characters/char-1/edit']}>
        <Routes>
          <Route path="/characters/:id/edit" element={<CharacterEditorPage />} />
          <Route path="/characters" element={<p>Character list</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  showToast.mockReset();
  getCharacter.mockReset().mockResolvedValueOnce(dnd5eCharacter()).mockResolvedValue(latest);
  updateCharacter.mockReset().mockRejectedValueOnce(stale);
});

describe('a stale save on the full-page editor', () => {
  it('keeps the edits, carries them onto the newest version and saves that when told to', async () => {
    const client = new QueryClient();
    client.setQueryData<Character[]>(queryKeys.characters, [dnd5eCharacter()]);
    renderPage(client);

    fireEvent.change(await screen.findByPlaceholderText('Character Name'), { target: { value: 'Aldra the Bold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const dialog = await screen.findByRole('dialog', { name: 'This character has changed' });
    expect(within(dialog).getByText(/Aldra the Bold/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Character Name')).toHaveValue('Aldra the Bold');
    // The Characters page already has the newer version.
    expect(client.getQueryData<Character[]>(queryKeys.characters)?.[0]).toEqual(latest);

    updateCharacter.mockResolvedValueOnce(saved);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save my changes' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(2));
    const second = updateCharacter.mock.calls[1][1] as { updatedAt?: string; data: { characterName?: string; hp?: { current: number } } };
    expect(second.updatedAt).toBe('2026-01-01T00:00:05.000Z');
    expect(second.data.characterName).toBe('Aldra the Bold');
    expect(second.data.hp?.current).toBe(7);

    // Saved: back to the sheet, nothing left to ask about on the way out.
    await waitFor(() => expect(screen.queryByPlaceholderText('Character Name')).toBeNull());
    expect(client.getQueryData<Character[]>(queryKeys.characters)?.[0]).toEqual(saved);
    fireEvent.click(screen.getByRole('button', { name: 'Back to characters' }));
    expect(await screen.findByText('Character list')).toBeInTheDocument();
  });

  it('saves nothing and keeps the edits when told to keep editing, and asks again on the next save', async () => {
    renderPage(new QueryClient());

    fireEvent.change(await screen.findByPlaceholderText('Character Name'), { target: { value: 'Aldra the Bold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'This character has changed' }))
      .getByRole('button', { name: 'Keep editing' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'This character has changed' })).toBeNull());
    expect(updateCharacter).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText('Character Name')).toHaveValue('Aldra the Bold');

    // The editor still holds the version it opened, so the next save is
    // refused again and the question comes back.
    updateCharacter.mockRejectedValueOnce(stale);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('dialog', { name: 'This character has changed' });
    expect((updateCharacter.mock.calls[1][1] as { updatedAt?: string }).updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
