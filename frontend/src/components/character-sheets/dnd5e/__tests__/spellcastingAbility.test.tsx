/**
 * Naming the spellcasting ability brings it into the spell save DC and attack.
 *
 * While no ability is named the editor keeps the DC at 8 + proficiency and the
 * attack at proficiency. The conversion that reads an older sheet's hand-typed
 * DC into its parts then took that number, the editor's own, as hand-typed, and
 * recorded minus the ability's modifier as the other bonus, so neither moved.
 * It now reads the sheet once, as it was stored.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { DND5E_SHEET, dnd5eCharacter } from './dnd5eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const stats = DND5E_SHEET.stats as Record<string, { score: number; modifier: number }>;
const slots = Object.fromEntries(['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((l) => [l, { total: 0, expended: 0 }]));
// Intelligence 16 (+3) and proficiency +2: DC 13, attack +5.
const wizard = (spellcasting: Record<string, unknown> | undefined) =>
  dnd5eCharacter({ stats: { ...stats, intelligence: { score: 16, modifier: 3 } }, spellcasting });

interface Saved {
  spellcasting: { spellSaveDC: number; spellAttackBonus: number; spellSaveDCOtherBonus?: number; spellAttackOtherBonus?: number };
}

function open(character: ReturnType<typeof wizard>) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<DnD5eCharacterEditor character={character} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Spells/ }));
  return onSave;
}

async function save(onSave: ReturnType<typeof open>): Promise<Saved> {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return onSave.mock.calls[0][0] as unknown as Saved;
}

const shownDC = () => screen.getByTitle(/^8 \+ proficiency/).textContent;

describe('naming the spellcasting ability', () => {
  it('raises the DC and attack on a sheet the editor saved with no ability named', async () => {
    const onSave = open(wizard({ ability: '', spellSaveDC: 10, spellAttackBonus: 2, cantrips: [], spells: [], slots }));
    fireEvent.change(screen.getByLabelText('Spellcasting Ability'), { target: { value: 'Intelligence' } });

    expect(shownDC()).toBe('13');
    const saved = await save(onSave);
    expect(saved.spellcasting).toMatchObject({ spellSaveDC: 13, spellAttackBonus: 5, spellSaveDCOtherBonus: 0, spellAttackOtherBonus: 0 });
  });

  it('raises them on a sheet with no spellcasting at all', async () => {
    const onSave = open(wizard(undefined));
    fireEvent.change(screen.getByLabelText('Spellcasting Ability'), { target: { value: 'Intelligence' } });

    expect(shownDC()).toBe('13');
    const saved = await save(onSave);
    expect(saved.spellcasting).toMatchObject({ spellSaveDC: 13, spellAttackBonus: 5 });
  });

  it('raises them when the ability is typed a letter at a time', async () => {
    const onSave = open(wizard({ ability: '', spellSaveDC: 10, spellAttackBonus: 2, cantrips: [], spells: [], slots }));
    const box = screen.getByLabelText('Spellcasting Ability');
    for (const typed of ['I', 'In', 'Int']) fireEvent.change(box, { target: { value: typed } });

    const saved = await save(onSave);
    expect(saved.spellcasting).toMatchObject({ spellSaveDC: 13, spellAttackBonus: 5 });
  });
});

describe('an older sheet with a hand-typed DC', () => {
  it('keeps what was typed, with the difference as the other bonus', async () => {
    // A Rod of the Pact Keeper's +1, typed into the DC and the attack.
    const onSave = open(wizard({ ability: 'Intelligence', spellSaveDC: 14, spellAttackBonus: 6, cantrips: [], spells: [], slots }));

    expect(shownDC()).toBe('14');
    const saved = await save(onSave);
    expect(saved.spellcasting).toMatchObject({ spellSaveDC: 14, spellAttackBonus: 6, spellSaveDCOtherBonus: 1, spellAttackOtherBonus: 1 });
  });
});
