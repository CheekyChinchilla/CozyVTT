/**
 * Every box in the Call of Cthulhu editor is named, and stops at the length a
 * sheet stores; a skill's improvement check can be reached from the keyboard.
 *
 * Almost no box was tied to a label, so a screen reader announced them by a
 * placeholder or not at all; only the investigator's name stopped at the
 * server's length; and the improvement checks were boxes drawn with a click
 * handler, which a keyboard could not reach and a screen reader did not know.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { cocCharacter } from './cocFixture';
import { SHEET_LONG_TEXT_MAX, SHEET_SHORT_TEXT_MAX } from '@/constants/sheetLimits';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const weapon = { name: '.38 Revolver', skill: 'Handgun', skillValue: 20, damage: '1d10', range: '15 yards', attacks: 1, ammo: 6, malfunction: 100, notes: '' };

function open(tab: RegExp) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<CallOfCthulhu7eCharacterEditor character={cocCharacter({ combat: { weapons: [weapon] } })} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: tab }));
  return onSave;
}

describe.each([
  ['Overview', /^Overview$/, [
    'Investigator name', 'Occupation', 'Era', 'Age', 'Sex', 'Residence', 'Birthplace',
    'STR', 'EDU', 'Current Sanity', 'Starting Sanity', 'Current HP', 'Current MP', 'Luck Score', 'Luck notes',
  ]],
  ['Skills', /^Skills$/, ['Value of Accounting', 'Improvement check for Accounting']],
  ['Combat', /^Combat$/, [
    'Name of weapon 1', 'Skill of weapon 1', 'Skill value of weapon 1', 'Damage of weapon 1', 'Range of weapon 1',
    'Attacks of weapon 1', 'Ammunition of weapon 1', 'Malfunction of weapon 1',
  ]],
  ['Possessions', /^Possessions$/, ['Spending Level', 'Cash on Hand', 'Assets', 'Wealth notes', 'Possessions']],
  ['Backstory', /^Backstory$/, ['Background & History', 'Encounters with Strange Entities', 'Height', 'Skin', 'Cthulhu Mythos', 'Spells']],
])('the %s tab', (_name, tab, labels) => {
  it.each(labels)('names the %s box', (label) => {
    open(tab);
    expect(screen.getAllByLabelText(label, { exact: true }).length).toBeGreaterThan(0);
  });
});

describe('text lengths', () => {
  it('stop one-line boxes at the one-line limit', () => {
    open(/^Overview$/);
    for (const label of ['Occupation', 'Era', 'Residence', 'Birthplace']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('maxLength', String(SHEET_SHORT_TEXT_MAX));
    }
  });

  it('stop paragraphs at the paragraph limit', () => {
    open(/^Backstory$/);
    expect(screen.getByLabelText('Background & History')).toHaveAttribute('maxLength', String(SHEET_LONG_TEXT_MAX));
  });
});

describe('an improvement check', () => {
  it('is a checkbox the keyboard reaches', async () => {
    const onSave = open(/^Skills$/);
    const check = screen.getByRole('checkbox', { name: 'Improvement check for Accounting' });
    expect(check).not.toBeChecked();
    fireEvent.click(check);
    expect(check).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const skills = (onSave.mock.calls[0][0] as unknown as { skills: { accounting: { improvementChecked: boolean } } }).skills;
    expect(skills.accounting.improvementChecked).toBe(true);
  });
});
