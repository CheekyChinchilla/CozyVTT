/**
 * A save refused because the character changed after the editor opened.
 *
 * The editor over a sheet used to close and throw away everything typed, so a
 * DM taking hit points at the table, or an older copy of the character opened
 * from the Characters page, cost the player their edits. It now stays open,
 * carries the player's own changes onto the newest version, shows them, and
 * saves only when told to. A field changed in both places is shown both ways
 * and the player picks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CharacterSheetEditorModal from '../CharacterSheetEditorModal';
import { dnd5eCharacter } from '@/components/character-sheets/dnd5e/__tests__/dnd5eFixture';
import type { Character } from '@/types';

const showToast = vi.fn();
const updateCharacter = vi.fn();
const getCharacter = vi.fn();

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));
vi.mock('@/services/api', () => ({
  api: {
    updateCharacter: (id: string, body: unknown) => updateCharacter(id, body),
    getCharacter: (id: string) => getCharacter(id),
  },
}));

const stale = { response: { status: 409, data: { error: 'Conflict', code: 'CHARACTER_CHANGED', message: 'changed' } } };

/** The character as stored after the DM took five hit points at the table. */
function latestWith(overrides: Record<string, unknown>): Character {
  return { ...dnd5eCharacter(overrides), updatedAt: '2026-01-01T00:00:05.000Z' };
}

interface SentBody {
  updatedAt?: string;
  data: { characterName?: string; hp?: { current: number } };
}

beforeEach(() => {
  showToast.mockReset();
  updateCharacter.mockReset();
  getCharacter.mockReset();
});

describe('a stale save in the editor over a sheet', () => {
  it('stays open, shows the changes carried onto the newest version, and saves them when told to', async () => {
    updateCharacter.mockRejectedValueOnce(stale);
    getCharacter.mockResolvedValue({ character: latestWith({ hp: { maximum: 12, current: 7, temporary: 0 } }) });
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<CharacterSheetEditorModal character={dnd5eCharacter()} onClose={onClose} onSaved={onSaved} />);

    fireEvent.change(screen.getByPlaceholderText('Character Name'), { target: { value: 'Aldra the Bold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const dialog = await screen.findByRole('dialog', { name: 'This character has changed' });
    expect(within(dialog).getByText(/Character name:/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Aldra the Bold/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(updateCharacter).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText('Character Name')).toHaveValue('Aldra the Bold');

    updateCharacter.mockResolvedValueOnce({ character: latestWith({ characterName: 'Aldra the Bold' }) });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save my changes' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(2));
    const second = updateCharacter.mock.calls[1][1] as SentBody;
    expect(second.updatedAt).toBe('2026-01-01T00:00:05.000Z');
    expect(second.data.characterName).toBe('Aldra the Bold');
    // The hit points taken at the table are not put back.
    expect(second.data.hp?.current).toBe(7);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalled();
  });

  it('keeps the editor and the edits, saving nothing, when the player chooses to keep editing', async () => {
    updateCharacter.mockRejectedValueOnce(stale);
    getCharacter.mockResolvedValue({ character: latestWith({ hp: { maximum: 12, current: 7, temporary: 0 } }) });
    const onClose = vi.fn();
    render(<CharacterSheetEditorModal character={dnd5eCharacter()} onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText('Character Name'), { target: { value: 'Aldra the Bold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'This character has changed' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'This character has changed' })).toBeNull());
    expect(updateCharacter).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Character Name')).toHaveValue('Aldra the Bold');
  });

  it('shows a field changed in both places both ways, and saves the one chosen', async () => {
    updateCharacter.mockRejectedValueOnce(stale);
    getCharacter.mockResolvedValue({ character: latestWith({ characterName: 'Aldra of the North' }) });
    render(<CharacterSheetEditorModal character={dnd5eCharacter()} onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Character Name'), { target: { value: 'Aldra the Bold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const dialog = await screen.findByRole('dialog', { name: 'This character has changed' });
    const save = within(dialog).getByRole('button', { name: 'Save my changes' });
    expect(save).toBeDisabled();
    expect(within(dialog).getByLabelText('Yours: Aldra the Bold')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText('Newest version: Aldra of the North'));

    updateCharacter.mockResolvedValueOnce({ character: latestWith({ characterName: 'Aldra of the North' }) });
    fireEvent.click(save);

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(2));
    expect((updateCharacter.mock.calls[1][1] as SentBody).data.characterName).toBe('Aldra of the North');
  });
});
