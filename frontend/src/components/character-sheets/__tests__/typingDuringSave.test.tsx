/**
 * What is typed while a save is in flight stays in the editor.
 *
 * Every field stays editable while a token picture uploads and the save goes
 * through. The sheets went back to their read-only view as soon as the save
 * finished, which threw away anything typed in those seconds, and the page
 * was then left believing there were unsaved changes with no editor to hold
 * them. A sheet now leaves its editor only when nothing was typed meanwhile;
 * otherwise it stays open with the newer text, still counted as unsaved.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { ComponentType } from 'react';
import type { Character } from '@/types';
import type { CharacterSheetProps } from '../types';
import { DnD5eCharacterSheet } from '../dnd5e/DnD5eCharacterSheet';
import { Pathfinder2eCharacterSheet } from '../pathfinder2e/Pathfinder2eCharacterSheet';
import { CallOfCthulhu7eCharacterSheet } from '../call-of-cthulhu-7e/CallOfCthulhu7eCharacterSheet';
import { FlexibleCharacterSheet } from '../FlexibleCharacterSheet';
import { dnd5eCharacter } from '../dnd5e/__tests__/dnd5eFixture';
import { pf2eCharacter } from '../pathfinder2e/__tests__/pf2eFixture';
import { cocCharacter } from '../call-of-cthulhu-7e/__tests__/cocFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const flexible = {
  id: 'flex-1', userId: 'user-1', name: 'Freeform', gameSystem: null, campaignId: null, tokenImageUrl: null,
  data: { sections: [{ id: 's1', title: 'Notes', type: 'text', value: '' }] },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Character;

interface Case {
  name: string;
  Sheet: ComponentType<CharacterSheetProps>;
  character: () => Character;
  field: string;
}

const cases: Case[] = [
  { name: 'D&D 5e', Sheet: DnD5eCharacterSheet, character: () => dnd5eCharacter(), field: 'Character Name' },
  { name: 'Pathfinder 2e', Sheet: Pathfinder2eCharacterSheet, character: () => pf2eCharacter(), field: 'Deity' },
  { name: 'Call of Cthulhu', Sheet: CallOfCthulhu7eCharacterSheet, character: () => cocCharacter(), field: 'Occupation' },
  { name: 'Flexible', Sheet: FlexibleCharacterSheet, character: () => flexible, field: 'Enter text content...' },
];

/** A save that finishes only when the test says so. */
function heldSave() {
  let finish: () => void = () => {};
  const onSave = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  return { onSave, finish: () => finish() };
}

describe.each(cases)('the $name sheet', ({ Sheet, character, field }) => {
  it('keeps what was typed during a save, and stays in the editor with it unsaved', async () => {
    const { onSave, finish } = heldSave();
    const onDirtyChange = vi.fn();
    render(<Sheet character={character()} mode="edit" onSave={onSave} onDirtyChange={onDirtyChange} />);

    fireEvent.change(screen.getByPlaceholderText(field), { target: { value: 'Typed before saving' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(field), { target: { value: 'Typed while saving' } });
    await act(async () => finish());

    expect(screen.getByPlaceholderText(field)).toHaveValue('Typed while saving');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('goes back to the read-only sheet when nothing was typed during the save', async () => {
    const { onSave, finish } = heldSave();
    const onDirtyChange = vi.fn();
    render(<Sheet character={character()} mode="edit" onSave={onSave} onDirtyChange={onDirtyChange} />);

    fireEvent.change(screen.getByPlaceholderText(field), { target: { value: 'Typed before saving' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await act(async () => finish());

    await waitFor(() => expect(screen.queryByPlaceholderText(field)).toBeNull());
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});
