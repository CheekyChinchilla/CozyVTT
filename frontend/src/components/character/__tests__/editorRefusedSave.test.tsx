/**
 * A save the server refuses leaves the in-page editor with unsaved changes.
 *
 * The editor answered every failed save as if it had worked, so the sheet
 * marked itself saved. Leaving then closed it without asking, and what was
 * typed was lost although none of it had reached the server. It also said
 * only that the sheet did not match, so a player over a limit could not tell
 * which box to shorten.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CharacterSheetEditorModal from '../CharacterSheetEditorModal';
import { pf2eCharacter } from '@/components/character-sheets/pathfinder2e/__tests__/pf2eFixture';
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
    await waitForDialogFocus();

    await userEvent.type(screen.getByPlaceholderText('Deity'), 'Torag');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error'));

    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(screen.getByText('Discard Changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Deity')).toHaveValue('Torag');
  });
});

describe('what the in-page editor says about a refused save', () => {
  const refusal = (issues: Array<{ path: string; message: string }>) => ({
    response: {
      status: 400,
      data: { message: 'Character data does not match game system schema', validationErrors: issues },
    },
  });

  async function saveRefused() {
    render(<CharacterSheetEditorModal character={pf2eCharacter()} onClose={vi.fn()} />);
    await waitForDialogFocus();
    await userEvent.type(screen.getByPlaceholderText('Deity'), 'Torag');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    return showToast.mock.calls[0];
  }

  it('names each field the server refused, with the reason', async () => {
    updateCharacter.mockRejectedValue(
      refusal([
        { path: 'inventory', message: 'Can hold at most 500 entries' },
        { path: 'backstory', message: 'Can be at most 100,000 characters' },
      ])
    );

    const [text, kind] = await saveRefused();

    expect(text).toBe('Not saved. inventory: Can hold at most 500 entries; backstory: Can be at most 100,000 characters');
    expect(kind).toBe('error');
  });

  it('names the first few and counts the rest, so the message stays readable', async () => {
    updateCharacter.mockRejectedValue(
      refusal(Array.from({ length: 8 }, (_unused, i) => ({ path: `inventory.${i}.name`, message: 'Too long' })))
    );

    const [text] = await saveRefused();

    expect(text).toContain('inventory.0.name: Too long');
    expect(text).toContain('inventory.4.name: Too long');
    expect(text).not.toContain('inventory.5.name');
    expect(text).toMatch(/and 3 more\.?$/);
  });

  it('falls back to the server message when it names no field', async () => {
    updateCharacter.mockRejectedValue(refusal([]));

    const [text] = await saveRefused();

    expect(text).toBe('Character data does not match game system schema');
  });
});
