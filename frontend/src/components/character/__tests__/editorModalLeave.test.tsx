/**
 * Leaving the editor that opens over a character sheet.
 *
 * It asks "Discard Changes?" only when something would be lost. It used to ask
 * every time, straight after opening and with nothing typed, which teaches
 * people to click through the one prompt that guards their edits.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Character } from '@/types';
import CharacterSheetEditorModal from '../CharacterSheetEditorModal';
import { pf2eCharacter } from '@/components/character-sheets/pathfinder2e/__tests__/pf2eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/services/api', () => ({
  api: { updateCharacter: vi.fn() },
}));

const flexible = {
  id: 'flex-1', userId: 'u1', name: 'Freeform', gameSystem: null, data: { sections: [] },
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Character;

describe('leaving the in-page editor', () => {
  it('closes at once when nothing was changed', async () => {
    const onClose = vi.fn();
    render(<CharacterSheetEditorModal character={pf2eCharacter()} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText('Discard Changes?')).not.toBeInTheDocument();
  });

  it('asks before throwing away something typed', async () => {
    const onClose = vi.fn();
    render(<CharacterSheetEditorModal character={pf2eCharacter()} onClose={onClose} />);

    await userEvent.type(screen.getByPlaceholderText('Deity'), 'Torag');
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(screen.getByText('Discard Changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes at once when a change was typed and then put back', async () => {
    const onClose = vi.fn();
    render(<CharacterSheetEditorModal character={pf2eCharacter()} onClose={onClose} />);

    await userEvent.type(screen.getByPlaceholderText('Character Name'), 'x{Backspace}');
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('closes at once for an untouched Flexible sheet', async () => {
    const onClose = vi.fn();
    render(<CharacterSheetEditorModal character={flexible} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText('Discard Changes?')).not.toBeInTheDocument();
  });

  it('asks once a section is added to a Flexible sheet', async () => {
    const onClose = vi.fn();
    render(<CharacterSheetEditorModal character={flexible} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: /Add Section/ }));
    await userEvent.click(screen.getByRole('button', { name: /Attributes/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(screen.getByText('Discard Changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

});
