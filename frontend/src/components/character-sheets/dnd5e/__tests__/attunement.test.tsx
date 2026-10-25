/**
 * Unticking Requires Attunement on a D&D 5e item ends its attunement.
 *
 * The Attuned box was hidden with it but stayed ticked underneath, so the item
 * went on taking one of the three attunement slots on the sheet.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { dnd5eCharacter } from './dnd5eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const ring = (fields: Record<string, unknown>) => ({ name: 'Ring of Protection', quantity: 1, weight: 0, ...fields });

async function openInventory(item: Record<string, unknown>) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<DnD5eCharacterEditor character={dnd5eCharacter({ inventory: [item] })} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Inventory/ }));
  return async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return (onSave.mock.calls[0][0] as unknown as { inventory: Record<string, unknown>[] }).inventory[0];
  };
}

describe('an item that requires attunement', () => {
  it('is no longer attuned once Requires Attunement is unticked', async () => {
    const save = await openInventory(ring({ requiresAttunement: true, attuned: true }));
    fireEvent.click(screen.getByLabelText('Requires Attunement'));

    expect(await save()).toMatchObject({ requiresAttunement: false, attuned: false });
  });

  it('offers the Attuned box on an item stored attuned without requiring it, so it can be cleared', async () => {
    const save = await openInventory(ring({ requiresAttunement: false, attuned: true }));
    fireEvent.click(screen.getByLabelText('Attuned'));

    expect(await save()).toMatchObject({ attuned: false });
  });
});
