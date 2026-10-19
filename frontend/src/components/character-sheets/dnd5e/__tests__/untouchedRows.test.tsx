/**
 * A row added with "+ Add" and never filled in does not stop a D&D 5e sheet
 * from saving.
 *
 * The add buttons made attack, item and spell rows with no name and hit dice
 * with no class, which the server refuses, so pressing one by mistake made a
 * sheet that could not be saved until the row was filled in or removed. A row
 * nobody has typed in is now left out of the save, and a new hit die starts
 * with the character's class.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { dnd5eCharacter } from './dnd5eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

interface Saved {
  attacks: { name: string }[];
  inventory: { name: string }[];
  hitDice: { class: string; die: string }[];
  spellcasting: { spells: { name: string }[] };
}

function open() {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(
    <DnD5eCharacterEditor
      character={dnd5eCharacter({ class: 'Wizard', hitDice: [], spellcasting: { ability: 'Intelligence', spells: [] } })}
      onSave={onSave}
      onCancel={vi.fn()}
    />
  );
  return async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return onSave.mock.calls[0][0] as unknown as Saved;
  };
}

const tab = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const add = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('rows added and never filled in', () => {
  it('are left out of the save', async () => {
    const save = open();
    tab(/Combat/);
    add('+ Add Attack');
    tab(/Inventory/);
    add('+ Add Item');
    tab(/Spells/);
    add('+ Add Spell');

    const saved = await save();
    expect(saved.attacks).toEqual([]);
    expect(saved.inventory.map((i) => i.name)).toEqual(['Rope']);
    expect(saved.spellcasting.spells).toEqual([]);
  });

  it('are kept once something is typed in them', async () => {
    const save = open();
    tab(/Combat/);
    add('+ Add Attack');
    fireEvent.change(screen.getByLabelText('Name of attack 1'), { target: { value: 'Quarterstaff' } });

    expect((await save()).attacks.map((a) => a.name)).toEqual(['Quarterstaff']);
  });
});

describe('a new hit die', () => {
  it('starts with the character\'s class, and is kept as it is', async () => {
    const save = open();
    tab(/Combat/);
    add('+ Add Hit Die');

    expect(screen.getByLabelText('Class of hit dice 1')).toHaveValue('Wizard');
    expect((await save()).hitDice).toEqual([expect.objectContaining({ class: 'Wizard', die: 'd6' })]);
  });
});
