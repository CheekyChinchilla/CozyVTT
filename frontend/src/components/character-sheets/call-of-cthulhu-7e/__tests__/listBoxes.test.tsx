/**
 * Typing into the Call of Cthulhu possessions and spells boxes.
 *
 * Both re-read the box on every keystroke, so a new line typed at the end was
 * dropped as an empty line, a space at the end of a line was trimmed before
 * the next word, and the " - " before an item's notes vanished because an item
 * with no notes is shown without it. Pasting worked.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { cocCharacter } from './cocFixture';

interface Saved {
  possessions: { name: string; notes: string }[];
  spellsAndMythos: { spells: string[] };
}

function renderEditor() {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<CallOfCthulhu7eCharacterEditor character={cocCharacter()} onSave={onSave} onCancel={vi.fn()} />);
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
    fireEvent.click(screen.getByRole('button', { name: 'Possessions' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Backstory' }));
    const box = screen.getByPlaceholderText(/Contact Nyarlathotep/) as HTMLTextAreaElement;

    await userEvent.type(box, 'Elder Sign{enter}Contact Nyarlathotep');

    expect((await save(onSave)).spellsAndMythos.spells).toEqual(['Elder Sign', 'Contact Nyarlathotep']);
  });
});
