/**
 * What the Pathfinder 2e editor adds to the Spells tab has to be something the
 * server accepts. A cantrip, spell or focus spell was added without fields the
 * schema requires, and a sheet with no spellcasting was sent as `null`, so the
 * save was refused, and every save after it, until the entry was deleted.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Pathfinder2eCharacterEditor } from '../Pathfinder2eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { PF2E_BLANK_SHEET, pf2eCharacter } from './pf2eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

type Sheet = Record<string, unknown> & { spellcasting?: Record<string, unknown> };

const spontaneous = { ...(PF2E_BLANK_SHEET.spellcasting as Record<string, unknown>), type: 'spontaneous' };

async function saveAfter(sheet: Record<string, unknown>, edit: () => void): Promise<Sheet> {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<Pathfinder2eCharacterEditor character={pf2eCharacter(sheet)} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Spells' }));
  edit();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return onSave.mock.calls[0][0] as unknown as Sheet;
}

const click = (name: string) => () => fireEvent.click(screen.getByRole('button', { name }));

describe('new spell entries', () => {
  it('adds a cantrip with every field the schema requires', async () => {
    const saved = await saveAfter({ spellcasting: spontaneous }, click('Add Cantrip'));
    expect(saved.spellcasting?.cantrips).toEqual([{ name: 'New Cantrip', rank: 1, prepared: false }]);
  });

  it('adds a spell with every field the schema requires', async () => {
    const saved = await saveAfter({ spellcasting: spontaneous }, click('Add Spell'));
    expect(saved.spellcasting?.spells).toEqual([
      { name: 'New Spell', rank: 1, prepared: false, ritual: false, heightened: false },
    ]);
  });

  it('adds a focus spell with every field the schema requires', async () => {
    const saved = await saveAfter({ spellcasting: spontaneous }, click('Add Focus Spell'));
    expect((saved.spellcasting?.focusSpells as { spells: unknown[] }).spells).toEqual([
      { name: 'New Focus Spell', rank: 1, prepared: false, ritual: false, heightened: false },
    ]);
  });

  it('turns on spellcasting with all ten slot ranks', async () => {
    const saved = await saveAfter({ spellcasting: undefined }, click('Enable Spellcasting'));
    const slots = saved.spellcasting?.slots as Record<string, unknown>;
    expect(Object.keys(slots)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(slots['10']).toEqual({ total: 0, expended: 0 });
  });

  it('leaves spellcasting out of a sheet that has none', async () => {
    const saved = await saveAfter({ spellcasting: undefined }, () => {});
    expect(saved.spellcasting).toBeUndefined();
  });

  it('gives a cantrip stored as a bare name the fields it lacks', async () => {
    const saved = await saveAfter({ spellcasting: { ...spontaneous, cantrips: ['Light'] } }, () => {});
    expect(saved.spellcasting?.cantrips).toEqual([{ name: 'Light', rank: 1, prepared: false }]);
  });
});
