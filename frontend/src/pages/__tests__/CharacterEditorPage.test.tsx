/**
 * Saving from the full-page character editor.
 *
 * A save the server refuses leaves the editor, and what was typed, in place.
 * The page used to report a failed save through the same state as a failed
 * load, so a refused save replaced the whole editor with "Failed to Load
 * Character" and every unsaved edit went with it.
 *
 * A save also says which version of the character it was made from, so one
 * made from a sheet that changed in the meantime is refused with 409 and does
 * not undo that change.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CharacterEditorPage from '../CharacterEditorPage';
import { pf2eCharacter } from '@/components/character-sheets/pathfinder2e/__tests__/pf2eFixture';

const showToast = vi.fn();
// One object for every render, as the real context gives: the page refetches
// whenever `user` changes identity.
const auth = { user: { id: 'user-1', platformRole: 'USER' } };

vi.mock('@/hooks/queries', () => ({
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/characters/char-1/edit']}>
      <Routes>
        <Route path="/characters/:id/edit" element={<CharacterEditorPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  showToast.mockReset();
  getCharacter.mockReset().mockResolvedValue(pf2eCharacter());
  updateCharacter.mockReset();
});

describe('a refused save', () => {
  it('keeps the editor and the edits, and says why', async () => {
    updateCharacter.mockRejectedValue({
      response: {
        status: 400,
        data: {
          message: 'Character data does not match game system schema',
          validationErrors: [{ path: 'class', message: 'Too small' }],
        },
      },
    });
    renderPage();

    const name = (await screen.findByPlaceholderText('Character Name')) as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Seelah the Bold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
    // Let the rejection settle before looking.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy());

    expect(screen.queryByText('Failed to Load Character')).toBeNull();
    expect((screen.getByPlaceholderText('Character Name') as HTMLInputElement).value).toBe('Seelah the Bold');
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('class: Too small'), 'error');
  });
});

describe('the version a save is made from', () => {
  it('sends the updatedAt the character was loaded with, and no unchanged picture', async () => {
    updateCharacter.mockResolvedValue({ ...pf2eCharacter(), updatedAt: '2026-01-01T00:00:09.000Z' });
    getCharacter.mockResolvedValue({ ...pf2eCharacter(), tokenImageUrl: '/api/assets/tokens/abc' });
    renderPage();

    await screen.findByPlaceholderText('Character Name');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());

    const body = updateCharacter.mock.calls[0][1] as Record<string, unknown>;
    expect(body.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(body).not.toHaveProperty('tokenImageUrl');
  });

  it('says so and loads the new version when the character changed meanwhile', async () => {
    updateCharacter.mockRejectedValue({
      response: { status: 409, data: { error: 'Conflict', code: 'CHARACTER_CHANGED', message: 'changed' } },
    });
    getCharacter
      .mockResolvedValueOnce(pf2eCharacter())
      .mockResolvedValueOnce(pf2eCharacter({ characterName: 'Changed at the table' }));
    renderPage();

    const name = (await screen.findByPlaceholderText('Character Name')) as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'My edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/changed/i), 'error'));
    await waitFor(() =>
      expect((screen.getByPlaceholderText('Character Name') as HTMLInputElement).value).toBe('Changed at the table')
    );
    expect(getCharacter).toHaveBeenCalledTimes(2);
  });
});
