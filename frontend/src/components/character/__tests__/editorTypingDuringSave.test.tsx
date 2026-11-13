/**
 * Typing while the editor that opens over a sheet saves.
 *
 * The editor closed once the save finished, so whatever was typed while it was
 * in flight went with it. It now stays open with that text, still counted as
 * unsaved, and its next save is made from the version just saved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import CharacterSheetEditorModal from '../CharacterSheetEditorModal';
import { fifthEditionCharacter } from '@/components/character-sheets/fifth-edition/__tests__/fifthEditionFixture';
import type { Character } from '@/types';

const updateCharacter = vi.fn();

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/services/api', () => ({
  api: { updateCharacter: (id: string, body: unknown) => updateCharacter(id, body) },
}));

beforeEach(() => {
  updateCharacter.mockReset();
});

describe('typing while the editor saves', () => {
  it('stays open with the text, and saves it from the version just saved', async () => {
    let finish: (response: { character: Character }) => void = () => {};
    updateCharacter.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<CharacterSheetEditorModal character={fifthEditionCharacter()} onClose={onClose} onSaved={onSaved} />);

    fireEvent.change(screen.getByPlaceholderText('Character Name'), { target: { value: 'Aldra the Bold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText('Character Name'), { target: { value: 'Aldra the Bolder' } });
    await act(async () =>
      finish({ character: { ...fifthEditionCharacter({ characterName: 'Aldra the Bold' }), updatedAt: '2026-01-01T00:00:09.000Z' } })
    );

    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Character Name')).toHaveValue('Aldra the Bolder');

    updateCharacter.mockResolvedValueOnce({ character: fifthEditionCharacter() });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(2));
    expect((updateCharacter.mock.calls[1][1] as { updatedAt?: string }).updatedAt).toBe('2026-01-01T00:00:09.000Z');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('closes once saved when nothing was typed meanwhile', async () => {
    updateCharacter.mockResolvedValue({ character: fifthEditionCharacter() });
    const onClose = vi.fn();
    render(<CharacterSheetEditorModal character={fifthEditionCharacter()} onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText('Character Name'), { target: { value: 'Aldra the Bold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
