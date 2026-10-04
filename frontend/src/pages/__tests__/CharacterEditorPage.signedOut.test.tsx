/**
 * Saving from the full-page editor after the browser was signed out.
 *
 * The save used to send the page to sign-in, and with it everything typed.
 * The editor now stays with the edits, says what happened and how to carry
 * on, and the same Save works once the browser has signed in again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CharacterEditorPage from '../CharacterEditorPage';
import { pf2eCharacter } from '@/components/character-sheets/pathfinder2e/__tests__/pf2eFixture';

const showToast = vi.fn();
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
const signedOut = { response: { status: 401, data: { error: 'Unauthorized', message: 'Authentication required' } } };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/characters/char-1/edit']}>
      <Routes>
        <Route path="/characters/:id/edit" element={<CharacterEditorPage />} />
        <Route path="/characters" element={<p>Character list</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  showToast.mockReset();
  getCharacter.mockReset().mockResolvedValue(pf2eCharacter());
  updateCharacter.mockReset();
});

describe('saving from the full-page editor while signed out', () => {
  it('keeps the editor and the edits, and says how to carry on', async () => {
    updateCharacter.mockRejectedValue(signedOut);
    renderPage();

    const name = (await screen.findByPlaceholderText('Character Name')) as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Seelah the Bold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/signed out/i));
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/auth/login');
    expect(screen.getByPlaceholderText('Character Name')).toHaveValue('Seelah the Bold');
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/signed out/i), 'error');
  });

  it('saves with the same button once signed in again, and the notice goes', async () => {
    updateCharacter.mockRejectedValueOnce(signedOut).mockResolvedValueOnce(pf2eCharacter());
    renderPage();

    const name = (await screen.findByPlaceholderText('Character Name')) as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Seelah the Bold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Character saved!', 'success'));
    expect(screen.queryByText(/signed out/i)).not.toBeInTheDocument();
  });
});
