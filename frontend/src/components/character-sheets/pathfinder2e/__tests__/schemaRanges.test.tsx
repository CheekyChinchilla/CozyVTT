/**
 * The Pathfinder 2e editor's boxes take everything a sheet stores.
 *
 * An item's value took whole numbers only, so 5 sp typed as 0.5 gp was saved
 * as 0; an item's quantity could not be 0, although the schema takes it; and a
 * strike's range of 0 showed as an empty box.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Pathfinder2eCharacterEditor } from '../Pathfinder2eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { pf2eCharacter } from './pf2eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

function open(overrides: Record<string, unknown>, tab: RegExp) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<Pathfinder2eCharacterEditor character={pf2eCharacter(overrides)} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: tab }));
  return async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return onSave.mock.calls[0][0] as unknown as Record<string, { value?: number }[]>;
  };
}

const rope = { name: 'Rope', quantity: 1, bulk: 'L', value: 0 };

describe('the boxes', () => {
  it('keep a fraction of a gold piece as an item\'s value', async () => {
    const save = open({ inventory: [rope] }, /Inventory/);
    fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: '0.5' } });
    expect((await save()).inventory[0].value).toBe(0.5);
  });

  it('let an item\'s quantity be 0', () => {
    open({ inventory: [rope] }, /Inventory/);
    expect(screen.getByPlaceholderText('Qty')).toHaveAttribute('min', '0');
  });

  it('show a strike\'s range of 0', () => {
    open({ strikes: [{ name: 'Fist', type: 'melee', attackBonus: 3, damageRoll: '1d4', damageType: 'bludgeoning', attributeModifier: 'strength', proficiencyRank: 'trained', itemBonus: 0, traits: [], range: 0 }] }, /Combat/);
    expect(screen.getByPlaceholderText('Range (ft)')).toHaveValue(0);
  });
});
