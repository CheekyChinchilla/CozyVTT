/**
 * A Flexible sheet says when it has unsaved changes, as the game-system
 * sheets do. It never did, so the full-page editor's back arrow left one
 * without asking and lost what was typed, and the editor that opens over a
 * sheet had to ask on every Cancel because it could not tell.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Character } from '@/types';
import { FlexibleCharacterSheet } from '../FlexibleCharacterSheet';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const flexible = {
  id: 'flex-1', userId: 'u1', name: 'Freeform', gameSystem: null, data: { sections: [] },
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Character;

async function addAttributesSection() {
  await userEvent.click(screen.getByRole('button', { name: /Add Section/ }));
  await userEvent.click(screen.getByRole('button', { name: /Attributes/ }));
}

describe('Flexible sheet unsaved changes', () => {
  it('reports nothing before an edit', () => {
    const onDirtyChange = vi.fn();
    render(<FlexibleCharacterSheet character={flexible} mode="edit" onDirtyChange={onDirtyChange} />);
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  });

  it('reports a change once a section is added', async () => {
    const onDirtyChange = vi.fn();
    render(<FlexibleCharacterSheet character={flexible} mode="edit" onDirtyChange={onDirtyChange} />);

    await addAttributesSection();

    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('reports nothing left unsaved once the save is done', async () => {
    const onDirtyChange = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<FlexibleCharacterSheet character={flexible} mode="edit" onDirtyChange={onDirtyChange} onSave={onSave} />);

    await addAttributesSection();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  });
});
