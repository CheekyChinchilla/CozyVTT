/**
 * The possessions box on the Call of Cthulhu editor.
 *
 * Each line is "Item - notes". The editor split a line at every " - ", so a
 * note that itself held one ("sharp - old") was cut short the moment anything
 * in the box was edited.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { cocCharacter } from './cocFixture';

describe('possessions', () => {
  it('keeps a note that contains " - " when the list is edited', async () => {
    const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
    render(
      <CallOfCthulhu7eCharacterEditor
        character={cocCharacter({ possessions: [{ name: 'Knife', notes: 'sharp - old' }] })}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Possessions' }));

    const box = screen.getByPlaceholderText(/List possessions/) as HTMLTextAreaElement;
    expect(box.value).toBe('Knife - sharp - old');
    fireEvent.change(box, { target: { value: 'Knife - sharp - old\nRope' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((onSave.mock.calls[0][0] as unknown as { possessions: unknown }).possessions).toEqual([
      { name: 'Knife', notes: 'sharp - old' },
      { name: 'Rope', notes: '' },
    ]);
  });
});
