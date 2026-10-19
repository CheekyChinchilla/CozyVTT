/**
 * A D&D 5e character's proficiency bonus follows their level.
 *
 * The bonus was a box of its own that nothing kept in step, so a character
 * taken from level 4 to 5 kept +2, and every save, skill and spell number
 * worked out from it stayed a level behind. It now moves with Level when it
 * was the old level's bonus. One set by hand to something else is kept, and
 * the sheet offers the level's bonus beside it.
 *
 * The Basic Rules' Character Advancement table: +2 at levels 1 to 4, +3 at 5
 * to 8, +4 at 9 to 12, +5 at 13 to 16, +6 at 17 to 20.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { DND5E_SHEET, dnd5eCharacter } from './dnd5eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const saves = DND5E_SHEET.savingThrows as Record<string, { proficient: boolean; bonus: number }>;

function open(level: number, proficiencyBonus: number) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  const character = dnd5eCharacter({
    level,
    proficiencyBonus,
    savingThrows: { ...saves, strength: { proficient: true, bonus: proficiencyBonus } },
  });
  render(<DnD5eCharacterEditor character={character} onSave={onSave} onCancel={vi.fn()} />);
  return async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return onSave.mock.calls[0][0] as unknown as {
      level: number;
      proficiencyBonus: number;
      savingThrows: Record<string, { bonus: number }>;
    };
  };
}

const level = () => screen.getByLabelText('Level');
const bonus = () => screen.getByLabelText('Proficiency Bonus');

describe('raising a level', () => {
  it('raises the proficiency bonus with it, and what is worked out from it', async () => {
    const save = open(4, 2);
    fireEvent.change(level(), { target: { value: '5' } });

    expect(bonus()).toHaveValue(3);
    const saved = await save();
    expect(saved).toMatchObject({ level: 5, proficiencyBonus: 3 });
    expect(saved.savingThrows.strength.bonus).toBe(3);
  });

  it('follows a level typed one digit at a time', async () => {
    const save = open(4, 2);
    fireEvent.change(level(), { target: { value: '' } });
    fireEvent.change(level(), { target: { value: '1' } });
    fireEvent.change(level(), { target: { value: '13' } });

    expect((await save()).proficiencyBonus).toBe(5);
  });

  it('lowers it when the level comes down', async () => {
    const save = open(9, 4);
    fireEvent.change(level(), { target: { value: '8' } });

    expect((await save()).proficiencyBonus).toBe(3);
  });

  it('stops at +6 while a level past 20 is being typed', () => {
    open(17, 6);
    fireEvent.change(level(), { target: { value: '25' } });

    expect(bonus()).toHaveValue(6);
  });

  it('says nothing while the bonus is the level\'s', () => {
    open(5, 3);
    expect(screen.queryByText(/gives \+/)).toBeNull();
  });
});

describe('a bonus set by hand', () => {
  it('is kept when the level changes', async () => {
    const save = open(1, 4);
    fireEvent.change(level(), { target: { value: '5' } });

    expect((await save()).proficiencyBonus).toBe(4);
  });

  it('is shown beside the level\'s bonus, which one press puts in its place', async () => {
    const save = open(5, 2);
    expect(screen.getByText('Level 5 gives +3.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Use +3' }));

    expect(bonus()).toHaveValue(3);
    expect(screen.queryByText(/gives \+/)).toBeNull();
    expect((await save()).proficiencyBonus).toBe(3);
  });
});
