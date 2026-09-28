/**
 * Editing a skill that lives inside a group on the Call of Cthulhu sheet.
 *
 * Brawl sits under `fighting`, the firearms under `firearms`, and other
 * languages, sciences and custom skills in lists. The editor wrote an edit to
 * any of them under a flat key such as `fighting.brawl`, which nothing reads
 * and the server drops, so the box snapped back and the save lost the change.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { COC_BLANK_SHEET, cocCharacter } from './cocFixture';

const skill = (currentValue: number) => ({ baseValue: 1, currentValue, improvementChecked: false });

function sheetWithGroupedSkills(): Record<string, unknown> {
  return {
    skills: {
      ...(COC_BLANK_SHEET.skills as Record<string, unknown>),
      languageOther: [{ language: 'Latin', ...skill(10) }],
      science: [{ specialization: 'Chemistry', ...skill(20) }],
      customSkills: [{ name: 'Cryptography', ...skill(40) }],
    },
  };
}

/** The value box on the row headed `label`. */
function valueBox(label: string): HTMLInputElement {
  const row = screen.getByText(label).closest('.group') as HTMLElement;
  return row.querySelector('input[type="number"]') as HTMLInputElement;
}

describe('grouped skills', () => {
  it('saves an edit to each kind of grouped skill where the sheet keeps it', async () => {
    const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
    render(<CallOfCthulhu7eCharacterEditor character={cocCharacter(sheetWithGroupedSkills())} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skills' }));

    fireEvent.change(valueBox('Fighting (Brawl)'), { target: { value: '60' } });
    fireEvent.change(valueBox('Firearms (Handgun)'), { target: { value: '45' } });
    fireEvent.change(valueBox('Language (Latin)'), { target: { value: '30' } });
    fireEvent.change(valueBox('Science (Chemistry)'), { target: { value: '35' } });
    fireEvent.change(valueBox('Cryptography'), { target: { value: '55' } });

    expect(valueBox('Fighting (Brawl)').value).toBe('60');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const skills = (onSave.mock.calls[0][0] as unknown as { skills: Record<string, unknown> }).skills;

    expect(Object.keys(skills).filter((key) => key.includes('.'))).toEqual([]);
    expect(skills.fighting).toEqual({ brawl: { baseValue: 25, currentValue: 60, improvementChecked: false }, custom: [] });
    expect((skills.firearms as Record<string, unknown>).handgun).toEqual({ baseValue: 20, currentValue: 45, improvementChecked: false });
    expect((skills.firearms as Record<string, unknown>).rifle).toEqual({ baseValue: 25, currentValue: 25, improvementChecked: false });
    expect(skills.languageOther).toEqual([{ language: 'Latin', ...skill(30) }]);
    expect(skills.science).toEqual([{ specialization: 'Chemistry', ...skill(35) }]);
    expect(skills.customSkills).toEqual([{ name: 'Cryptography', ...skill(55) }]);
  });

  it('still saves an ordinary skill as before', async () => {
    const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
    render(<CallOfCthulhu7eCharacterEditor character={cocCharacter()} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skills' }));

    fireEvent.change(valueBox('Library Use'), { target: { value: '70' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    const skills = (onSave.mock.calls[0][0] as unknown as { skills: Record<string, { currentValue: number }> }).skills;
    expect(skills.libraryUse.currentValue).toBe(70);
  });
});
