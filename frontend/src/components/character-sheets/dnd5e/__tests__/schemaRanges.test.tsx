/**
 * The D&D 5e editor's boxes take everything a sheet stores.
 *
 * An item's value took whole numbers only, so 5 sp typed as 0.5 gp was saved
 * as 0, and a spell's level box started at 1 although a sheet stores a spell
 * of level 0, a cantrip, in its list. A hit die pool could show more dice left
 * than it holds.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { dnd5eCharacter } from './dnd5eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

function open(overrides: Record<string, unknown>, tab: RegExp) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<DnD5eCharacterEditor character={dnd5eCharacter(overrides)} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: tab }));
  return async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return onSave.mock.calls[0][0] as unknown as Record<string, never>;
  };
}

describe('the boxes', () => {
  it('keep a fraction of a gold piece as an item\'s value', async () => {
    const save = open({}, /Inventory/);
    fireEvent.change(screen.getByLabelText('Value (gp)'), { target: { value: '0.5' } });

    expect(((await save()).inventory as { value: number }[])[0].value).toBe(0.5);
  });

  it('let a spell be level 0', () => {
    open({ spellcasting: { ability: 'Wisdom', spells: [{ level: 0, name: 'Guidance', prepared: true, ritual: false, concentration: false }] } }, /Spells/);
    expect(screen.getByLabelText('Level of spell 1')).toHaveAttribute('min', '0');
  });

  it('stop a hit die pool\'s dice left at the dice it holds', async () => {
    const save = open({ hitDice: [{ class: 'Fighter', die: 'd10', maximum: 3, remaining: 3 }] }, /Combat/);
    expect(screen.getByLabelText('Hit dice left in row 1')).toHaveAttribute('max', '3');

    fireEvent.change(screen.getByLabelText('Hit dice in row 1 at full'), { target: { value: '2' } });
    expect(((await save()).hitDice as { remaining: number }[])[0].remaining).toBe(2);
  });
});
