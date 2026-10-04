/**
 * Escape in the editor that opens over a character sheet.
 *
 * Escape closed the editor without asking, losing whatever was typed. It now
 * does what the editor's Cancel button does. The sheet behind the editor is
 * covered by viewerModalEscape.test.tsx.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('Escape in the in-page editor', () => {
  it('closes at once when nothing was changed', async () => {
    const onClose = vi.fn();
    render(<CharacterSheetEditorModal character={pf2eCharacter()} onClose={onClose} />);

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('asks before throwing away something typed', async () => {
    const onClose = vi.fn();
    render(<CharacterSheetEditorModal character={pf2eCharacter()} onClose={onClose} />);

    await userEvent.type(screen.getByPlaceholderText('Deity'), 'Torag');
    await userEvent.keyboard('{Escape}');

    expect(screen.getByText('Discard Changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a second Escape closes the question and keeps the edits', async () => {
    const onClose = vi.fn();
    render(<CharacterSheetEditorModal character={pf2eCharacter()} onClose={onClose} />);

    await userEvent.type(screen.getByPlaceholderText('Deity'), 'Torag');
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByText('Discard Changes?')).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Deity')).toHaveValue('Torag');
  });
});
