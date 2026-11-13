/**
 * Typing into the Horror d100 possessions, spells and distinctive features
 * boxes.
 *
 * Each re-read the box on every keystroke, so a new line typed at the end was
 * dropped as an empty line, a space at the end of a line was trimmed before
 * the next word, and the " - " before an item's notes vanished because an item
 * with no notes is shown without it. Pasting worked.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HorrorD100CharacterEditor } from '../HorrorD100CharacterEditor';
import type { CharacterData } from '../../../../types';
import { horrorD100Character } from './sheetFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

interface Saved {
  possessions: { name: string; notes: string }[];
  spells: string[];
  distinctiveFeatures: string[];
}

function renderEditor() {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<HorrorD100CharacterEditor character={horrorD100Character()} onSave={onSave} onCancel={vi.fn()} />);
  return onSave;
}

async function save(onSave: ReturnType<typeof renderEditor>): Promise<Saved> {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return onSave.mock.calls[0][0] as unknown as Saved;
}

describe('possessions', () => {
  it('keeps each line, and the notes after " - ", as they are typed', async () => {
    const onSave = renderEditor();
    fireEvent.click(screen.getByRole('tab', { name: 'Possessions' }));
    const box = screen.getByPlaceholderText(/List possessions/) as HTMLTextAreaElement;

    await userEvent.type(box, 'Pocket knife - sharp{enter}Rope');

    expect(box.value).toBe('Pocket knife - sharp\nRope');
    expect((await save(onSave)).possessions).toEqual([
      { name: 'Pocket knife', notes: 'sharp' },
      { name: 'Rope', notes: '' },
    ]);
  });
});

describe('spells', () => {
  it('keeps the spaces and new lines typed between spells', async () => {
    const onSave = renderEditor();
    fireEvent.click(screen.getByRole('tab', { name: 'Story' }));
    const box = screen.getByPlaceholderText(/Call the Grey Lantern/) as HTMLTextAreaElement;

    await userEvent.type(box, 'Ward of Ash{enter}Call the Grey Lantern');

    expect((await save(onSave)).spells).toEqual(['Ward of Ash', 'Call the Grey Lantern']);
  });
});

describe('distinctive features', () => {
  it('keeps the spaces and new lines typed between them', async () => {
    const onSave = renderEditor();
    fireEvent.click(screen.getByRole('tab', { name: 'Story' }));
    const box = screen.getByRole('textbox', { name: 'Distinctive features' });

    await userEvent.type(box, 'A rope burn{enter}One gold earring');

    expect((await save(onSave)).distinctiveFeatures).toEqual(['A rope burn', 'One gold earring']);
  });
});
