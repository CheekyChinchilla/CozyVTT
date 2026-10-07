/**
 * Saving from the editor opened over a campaign.
 *
 * The save says which version of the character the editor opened, so one made
 * after the character changed at the table is refused and does not put back
 * the hit points the DM took (what happens then is in editorStaleSave.test). That has to be the version the editor opened
 * with, not whatever the modal was last handed: the sheet behind it refreshes,
 * and the editor's own copy does not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  updateCharacter.mockReset();
});

describe('CharacterSheetEditorModal', () => {
  it('sends the updatedAt the editor opened with, even after the sheet behind it refreshed', async () => {
    updateCharacter.mockResolvedValue({ character: pf2eCharacter() });
    const { rerender } = render(<CharacterSheetEditorModal character={pf2eCharacter()} onClose={vi.fn()} />);
    rerender(
      <CharacterSheetEditorModal character={{ ...pf2eCharacter(), updatedAt: '2026-01-01T00:00:05.000Z' }} onClose={vi.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save', hidden: true }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());

    expect((updateCharacter.mock.calls[0][1] as { updatedAt?: string }).updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
