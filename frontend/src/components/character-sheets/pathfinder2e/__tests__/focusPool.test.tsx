/**
 * The Pathfinder 2e focus pool.
 *
 * Add Focus Spell set the pool to 3 whatever the spells, the points left were
 * held to 3 where they should be held to the pool, and the pool had no box.
 * The rules: "a focus pool of 1 Focus Point the first time you gain an ability
 * that gives you a focus spell", feats typically add one, and the pool "can't
 * have a capacity beyond 3" (Core Rulebook p. 300).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Pathfinder2eCharacterEditor } from '../Pathfinder2eCharacterEditor';
import { Pathfinder2eCharacterView } from '../Pathfinder2eCharacterView';
import type { CharacterData } from '../../../../types';
import { PF2E_BLANK_SHEET, pf2eCharacter } from './pf2eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const spellcasting = PF2E_BLANK_SHEET.spellcasting as Record<string, unknown>;
const spell = (name: string) => ({ name, rank: 1, prepared: false, ritual: false, heightened: false });

function open(total: number, current: number, spells: unknown[] = []) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(
    <Pathfinder2eCharacterEditor
      character={pf2eCharacter({ spellcasting: { ...spellcasting, focusSpells: { focusPoints: { total, current }, spells } } })}
      onSave={onSave}
      onCancel={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /Spells/ }));
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
    render(<Pathfinder2eCharacterView character={pf2eCharacter({ spellcasting: { ...spellcasting, focusSpells: { focusPoints: { total: 1, current: 3 }, spells: [spell('Lay on Hands')] } } })} />);
    expect(screen.getByText(/Focus Points/).textContent).toContain('1 / 1');
  });

  it('reads a slot count stored under its old name', () => {
    const slots = { ...(spellcasting.slots as Record<string, unknown>), '1': { total: 3, used: 1 } };
    render(<Pathfinder2eCharacterView character={pf2eCharacter({ spellcasting: { ...spellcasting, slots } })} />);
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
});
