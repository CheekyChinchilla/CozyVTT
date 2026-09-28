/**
 * The spell slot boxes on the Pathfinder 2e editor.
 *
 * The sheet stores how many slots of a rank are used as `expended`, which is
 * what the schema declares and the read-only sheet shows. The editor read and
 * wrote `used` instead, a key the server drops on save, so the count was lost.
 * Sheets saved on 1.4.0 kept the key, and their count has to survive the first
 * save on this version.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Pathfinder2eCharacterEditor } from '../Pathfinder2eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { PF2E_BLANK_SHEET, pf2eCharacter } from './pf2eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

type Slots = Record<string, Record<string, number>>;

function spellcastingWithSlots(slots: Slots): Record<string, unknown> {
  const base = PF2E_BLANK_SHEET.spellcasting as Record<string, unknown>;
  return { ...base, slots: { ...(base.slots as Slots), ...slots } };
}

async function openSpellsAndSave(spellcasting: Record<string, unknown>, edit?: () => void): Promise<Slots> {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<Pathfinder2eCharacterEditor character={pf2eCharacter({ spellcasting })} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Spells' }));
  edit?.();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  const saved = onSave.mock.calls[0][0] as unknown as { spellcasting: { slots: Slots } };
  return saved.spellcasting.slots;
}

describe('spell slots', () => {
  it('saves the used count as expended', async () => {
    const slots = await openSpellsAndSave(spellcastingWithSlots({ '1': { total: 3, expended: 0 } }), () => {
      fireEvent.change(screen.getAllByPlaceholderText('Used')[0], { target: { value: '2' } });
    });

    expect(slots['1']).toEqual({ total: 3, expended: 2 });
  });

  it('shows the stored expended count in the Used box', () => {
    render(
      <Pathfinder2eCharacterEditor
        character={pf2eCharacter({ spellcasting: spellcastingWithSlots({ '1': { total: 3, expended: 1 } }) })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Spells' }));

    expect((screen.getAllByPlaceholderText('Used')[0] as HTMLInputElement).value).toBe('1');
  });

  it('keeps a count saved on 1.4.0 under the old name', async () => {
    const slots = await openSpellsAndSave(spellcastingWithSlots({ '1': { total: 3, expended: 0, used: 2 } }));

    expect(slots['1']).toEqual({ total: 3, expended: 2 });
  });
});
