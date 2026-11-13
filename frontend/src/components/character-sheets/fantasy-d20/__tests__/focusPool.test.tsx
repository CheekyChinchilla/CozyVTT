/**
 * The Fantasy d20 focus pool.
 *
 * Add Focus Spell set the pool to 3 whatever the spells, the points left were
 * held to 3 where they should be held to the pool, and the pool had no box.
 * The rules: the pool holds 1 Focus Point once the character has a focus
 * spell, feats typically add one, and it never holds more than 3.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FantasyD20CharacterEditor } from '../FantasyD20CharacterEditor';
import { FantasyD20CharacterView } from '../FantasyD20CharacterView';
import type { CharacterData } from '../../../../types';
import { FANTASY_D20_BLANK_SHEET, fantasyD20Character } from './fantasyD20Fixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const spellcasting = FANTASY_D20_BLANK_SHEET.spellcasting as Record<string, unknown>;
const spell = (name: string) => ({ name, rank: 1, prepared: false, ritual: false, heightened: false });

function open(total: number, current: number, spells: unknown[] = []) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(
    <FantasyD20CharacterEditor
      character={fantasyD20Character({ spellcasting: { ...spellcasting, focusSpells: { focusPoints: { total, current }, spells } } })}
      onSave={onSave}
      onCancel={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('tab', { name: /Spells/ }));
  return async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return (onSave.mock.calls[0][0] as unknown as { spellcasting: { focusSpells: { focusPoints: { total: number; current: number } } } })
      .spellcasting.focusSpells.focusPoints;
  };
}

describe('the focus pool', () => {
  it('holds 1 point once the first focus spell is added', async () => {
    const save = open(0, 0);
    fireEvent.click(screen.getByRole('button', { name: /Add Focus Spell/ }));
    expect((await save()).total).toBe(1);
  });

  it('is left as it is by a further focus spell', async () => {
    const save = open(1, 1, [spell('Lay on Hands')]);
    fireEvent.click(screen.getByRole('button', { name: /Add Focus Spell/ }));
    expect((await save()).total).toBe(1);
  });

  it('has a total box from 0 to 3, which the points left stay within', async () => {
    const save = open(2, 2, [spell('Lay on Hands')]);
    const total = screen.getByLabelText('Focus point total');
    expect([total.getAttribute('min'), total.getAttribute('max')]).toEqual(['0', '3']);
    expect(screen.getByLabelText('Focus points left')).toHaveAttribute('max', '2');

    fireEvent.change(total, { target: { value: '1' } });
    expect(await save()).toEqual({ total: 1, current: 1 });
  });

  it('opens a pool stored with more points left than it holds within it, and says so', async () => {
    const save = open(1, 3, [spell('Lay on Hands')]);
    expect(screen.getByText(/changed to follow the rules as it opened/)).toHaveTextContent('focus points left (3 to 1)');
    expect(await save()).toEqual({ total: 1, current: 1 });
  });
});

describe('the read-only sheet', () => {
  it('shows no more focus points left than the pool holds', () => {
    render(<FantasyD20CharacterView character={fantasyD20Character({ spellcasting: { ...spellcasting, focusSpells: { focusPoints: { total: 1, current: 3 }, spells: [spell('Lay on Hands')] } } })} />);
    expect(screen.getByText(/Focus Points/).textContent).toContain('1 / 1');
  });

  it('reads a slot count stored under its old name', () => {
    const slots = { ...(spellcasting.slots as Record<string, unknown>), '1': { total: 3, used: 1 } };
    render(<FantasyD20CharacterView character={fantasyD20Character({ spellcasting: { ...spellcasting, slots } })} />);
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
});
