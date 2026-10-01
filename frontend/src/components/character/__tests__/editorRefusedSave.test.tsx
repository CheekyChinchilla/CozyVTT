/**
 * A save the server refuses leaves the in-page editor with unsaved changes.
 *
 * The editor answered every failed save as if it had worked, so the sheet
 * marked itself saved. Leaving then closed it without asking, and what was
 * typed was lost although none of it had reached the server.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CharacterSheetEditorModal from '../CharacterSheetEditorModal';
import { pf2eCharacter } from '@/components/character-sheets/pathfinder2e/__tests__/pf2eFixture';

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

beforeEach(() => {
  showToast.mockReset();
  updateCharacter.mockReset().mockRejectedValue({
    response: { status: 400, data: { message: 'Character data does not match game system schema' } },
  });
});

describe('a refused save in the in-page editor', () => {
  it('stays open with the edits, and asks before they are discarded', async () => {
    const onClose = vi.fn();
    render(<CharacterSheetEditorModal character={pf2eCharacter()} onClose={onClose} />);

    await userEvent.type(screen.getByPlaceholderText('Deity'), 'Torag');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error'));

    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(screen.getByText('Discard Changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Deity')).toHaveValue('Torag');
  });
});
