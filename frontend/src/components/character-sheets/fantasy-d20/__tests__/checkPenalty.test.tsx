/**
 * A Fantasy d20 skill's check penalty lowers the skill whichever way it is
 * typed.
 *
 * The box subtracted what was typed, so a penalty entered as printed (-2)
 * raised the skill by 2. In the rules a penalty always lowers a total. The
 * box is now Check penalty and takes 0 or below, and a
 * sheet stored with a positive one opens with it negative and a note.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FantasyD20CharacterEditor } from '../FantasyD20CharacterEditor';
import type { CharacterData } from '../../../../types';
import { FANTASY_D20_BLANK_SHEET, fantasyD20Character } from './fantasyD20Fixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const skills = FANTASY_D20_BLANK_SHEET.skills as Record<string, Record<string, unknown>>;
const attributes = FANTASY_D20_BLANK_SHEET.attributes as Record<string, unknown>;

/** Strength 16 (+3), trained in Athletics at level 1: +6 before the penalty. */
function open(armorPenalty: number) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(
    <FantasyD20CharacterEditor
      character={fantasyD20Character({
        attributes: { ...attributes, strength: { score: 16, modifier: 3 } },
        skills: { ...skills, athletics: { ...skills.athletics, proficiencyRank: 'trained', armorPenalty } },
      })}
      onSave={onSave}
      onCancel={vi.fn()}
    />
  );
  return async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return (onSave.mock.calls[0][0] as unknown as { skills: { athletics: { bonus: number; armorPenalty: number } } }).skills.athletics;
  };
}

describe('the check penalty', () => {
  it('lowers the skill when typed as printed', async () => {
    const save = open(0);
    fireEvent.change(screen.getByLabelText('Check penalty for Athletics'), { target: { value: '-2' } });
    expect(await save()).toMatchObject({ bonus: 4, armorPenalty: -2 });
  });

  it('takes 0 or below', () => {
    open(0);
    expect(screen.getByLabelText('Check penalty for Athletics')).toHaveAttribute('max', '0');
  });

  it('opens a positive one stored by an earlier version as negative, and says so', async () => {
    const save = open(2);
    expect(screen.getByText(/changed to follow the rules as it opened/)).toHaveTextContent('Athletics check penalty (2 to -2)');
    expect(await save()).toMatchObject({ bonus: 4, armorPenalty: -2 });
  });
});
