/**
 * One Cthulhu Mythos on a Call of Cthulhu sheet.
 *
 * It was stored twice: the skill, which sets maximum Sanity ("99 minus
 * Cthulhu Mythos") and is what is rolled, and a box on the Backstory tab,
 * the only one that could be edited. Typing in the box changed neither, so
 * maximum Sanity never came down. The box now edits the skill, and saving
 * writes both the same.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { COC_BLANK_SHEET, cocCharacter } from './cocFixture';

const skills = COC_BLANK_SHEET.skills as Record<string, unknown>;

interface Saved {
  skills: { cthulhuMythos: { currentValue: number } };
  spellsAndMythos: { cthulhuMythos: number };
  derivedStats: { sanity: { maximum: number } };
}

function open(skill: number, box: number | undefined) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(
    <CallOfCthulhu7eCharacterEditor
      character={cocCharacter({
        skills: { ...skills, cthulhuMythos: { baseValue: 0, currentValue: skill, improvementChecked: false } },
        ...(box === undefined ? {} : { spellsAndMythos: { cthulhuMythos: box, spells: [] } }),
      })}
      onSave={onSave}
      onCancel={vi.fn()}
    />
  );
  return async (): Promise<Saved> => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return onSave.mock.calls[0][0] as unknown as Saved;
  };
}

describe('Cthulhu Mythos', () => {
  it('typed in the box lowers maximum Sanity and is saved as the skill', async () => {
    const save = open(0, 0);
    fireEvent.click(screen.getByRole('button', { name: /Backstory/ }));
    fireEvent.change(screen.getByLabelText('Cthulhu Mythos'), { target: { value: '8' } });

    const saved = await save();
    expect(saved.skills.cthulhuMythos.currentValue).toBe(8);
    expect(saved.spellsAndMythos.cthulhuMythos).toBe(8);
    expect(saved.derivedStats.sanity.maximum).toBe(91);
  });

  it('opens with the larger of the two copies, which only the box could raise before', async () => {
    const save = open(0, 5);
    const saved = await save();
    expect(saved.skills.cthulhuMythos.currentValue).toBe(5);
    expect(saved.derivedStats.sanity.maximum).toBe(94);
  });

  it('stops the box at 99, where maximum Sanity reaches 0', () => {
    open(0, undefined);
    fireEvent.click(screen.getByRole('button', { name: /Backstory/ }));
    expect(screen.getByLabelText('Cthulhu Mythos')).toHaveAttribute('max', '99');
  });
});
