/**
 * Saving from the in-page editor after the browser was signed out.
 *
 * The save used to send the page to sign-in and the edits were gone. The
 * editor now stays open with everything typed, says what happened and how to
 * carry on, and the same Save works once the browser has signed in again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CharacterSheetEditorModal from '../CharacterSheetEditorModal';
import { fantasyD20Character } from '@/components/character-sheets/fantasy-d20/__tests__/fantasyD20Fixture';
import { waitForDialogFocus } from '@/test/dialogFocus';

const showToast = vi.fn();
const updateCharacter = vi.fn();

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));
vi.mock('@/services/api', () => ({
  api: { updateCharacter: (id: string, body: unknown) => updateCharacter(id, body) },
}));

const signedOut = { response: { status: 401, data: { error: 'Unauthorized', message: 'Authentication required' } } };

beforeEach(() => {
  showToast.mockReset();
  updateCharacter.mockReset();
});

describe('saving from the in-page editor while signed out', () => {
  it('keeps the editor and the edits, and says how to carry on', async () => {
    updateCharacter.mockRejectedValue(signedOut);
    const onClose = vi.fn();
    render(<CharacterSheetEditorModal character={fantasyD20Character()} onClose={onClose} />);
    await waitForDialogFocus();

    await userEvent.type(screen.getByPlaceholderText('Deity'), 'The Quiet Forge');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/signed out/i));
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/auth/login');
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('target', '_blank');
    expect(screen.getByPlaceholderText('Deity')).toHaveValue('The Quiet Forge');
    expect(onClose).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/signed out/i), 'error');
  });

  it('saves with the same button once signed in again', async () => {
    updateCharacter.mockRejectedValueOnce(signedOut).mockResolvedValueOnce({ character: fantasyD20Character() });
    const onClose = vi.fn();
    render(<CharacterSheetEditorModal character={fantasyD20Character()} onClose={onClose} />);
    await waitForDialogFocus();

    await userEvent.type(screen.getByPlaceholderText('Deity'), 'The Quiet Forge');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect((updateCharacter.mock.calls[1][1] as { data: { deity?: string } }).data.deity).toBe('The Quiet Forge');
  });
});
