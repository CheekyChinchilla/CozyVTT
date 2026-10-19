/**
 * Maximum hit points in the Pathfinder 2e editor.
 *
 * A 0 typed for ancestry or class hit points was read as 6, so the maximum
 * came out 6 higher than the boxes said. It is read as typed now. A sheet made
 * from the old blank template stores neither (both 0, maximum 10) and keeps
 * the maximum it has until one is filled in.
 */
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Pathfinder2eCharacterEditor } from '../Pathfinder2eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { PF2E_BLANK_SHEET, pf2eCharacter } from './pf2eFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const hp = PF2E_BLANK_SHEET.hp as Record<string, unknown>;

async function saved(hpOverride: Record<string, unknown>, type?: [string, string]) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<Pathfinder2eCharacterEditor character={pf2eCharacter({ hp: { ...hp, ...hpOverride } })} onSave={onSave} onCancel={vi.fn()} />);
  if (type) {
    if (!screen.queryByLabelText(type[0])) fireEvent.click(screen.getByRole('button', { name: /^Combat$/ }));
    fireEvent.change(screen.getByLabelText(type[0]), { target: { value: type[1] } });
  }
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return (onSave.mock.calls[0][0] as unknown as { hp: { maximum: number } }).hp.maximum;
}

it('reads a 0 typed for ancestry hit points as 0', async () => {
  expect(await saved({ ancestryHp: 8, classHpPerLevel: 10, maximum: 18, current: 18 }, ['Ancestry HP', '0'])).toBe(10);
});

it('keeps the maximum of a sheet that stores neither', async () => {
  expect(await saved({ ancestryHp: 0, classHpPerLevel: 0, maximum: 10, current: 10 })).toBe(10);
});
