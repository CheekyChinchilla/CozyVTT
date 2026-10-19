/**
 * The D&D 5e editor keeps its manual bonuses within what the server stores.
 *
 * The server holds initiative, passive Perception and the two spellcasting
 * "other bonus" boxes to -30 to +30. The boxes took any number, and an older
 * sheet's stored total was read back into them whatever its size, so the
 * sheet could be filled in and then not saved.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import { dnd5eCharacter } from './dnd5eFixture';
import { MAX_BONUS_OVERRIDE, MIN_BONUS_OVERRIDE } from '@/utils/rules/dnd5e';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

function open(overrides: Record<string, unknown>) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<DnD5eCharacterEditor character={dnd5eCharacter(overrides)} onSave={onSave} onCancel={vi.fn()} />);
  return onSave;
}

const spellcasting = { ability: 'Intelligence', spellSaveDCOtherBonus: 0, spellAttackOtherBonus: 0, slots: undefined, spells: [] };

describe('manual bonuses in the D&D 5e editor', () => {
  it('stops each box at the range the server stores', () => {
    open({ spellcasting });
    const range = (box: HTMLElement) => [box.getAttribute('min'), box.getAttribute('max')];
    const expected = [String(MIN_BONUS_OVERRIDE), String(MAX_BONUS_OVERRIDE)];

    expect(range(screen.getByLabelText('Other bonus to passive Perception'))).toEqual(expected);
    fireEvent.click(screen.getByRole('button', { name: /Combat/ }));
    expect(range(screen.getByLabelText('Initiative — other bonus'))).toEqual(expected);
    fireEvent.click(screen.getByRole('button', { name: /Spells/ }));
    // Higher, where -30 would take the DC below the 1 the server stores:
    // 8 + proficiency 2 + Intelligence 0 leaves -9.
    expect(range(screen.getByLabelText('Spell save DC other bonus'))).toEqual(['-9', String(MAX_BONUS_OVERRIDE)]);
    expect(range(screen.getByLabelText('Spell attack other bonus'))).toEqual(expected);
  });

  it('reads an older sheet with an initiative far out of range back within it', async () => {
    const onSave = open({ initiative: 9999, initiativeBonus: undefined, spellcasting });
    fireEvent.click(screen.getByRole('button', { name: /Combat/ }));
    expect(screen.getByLabelText('Initiative — other bonus')).toHaveValue(MAX_BONUS_OVERRIDE);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((onSave.mock.calls[0][0] as { initiativeBonus: number }).initiativeBonus).toBe(MAX_BONUS_OVERRIDE);
  });

  it('brings bonuses stored out of range within it', async () => {
    const onSave = open({
      passivePerceptionBonus: 500,
      initiativeBonus: -500,
      spellcasting: { ...spellcasting, spellSaveDCOtherBonus: 77, spellAttackOtherBonus: -77 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    const saved = onSave.mock.calls[0][0] as {
      passivePerceptionBonus: number;
      initiativeBonus: number;
      spellcasting: { spellSaveDCOtherBonus: number; spellAttackOtherBonus: number };
    };
    expect(saved.passivePerceptionBonus).toBe(MAX_BONUS_OVERRIDE);
    expect(saved.initiativeBonus).toBe(MIN_BONUS_OVERRIDE);
    expect(saved.spellcasting.spellSaveDCOtherBonus).toBe(MAX_BONUS_OVERRIDE);
    expect(saved.spellcasting.spellAttackOtherBonus).toBe(MIN_BONUS_OVERRIDE);
  });
});
