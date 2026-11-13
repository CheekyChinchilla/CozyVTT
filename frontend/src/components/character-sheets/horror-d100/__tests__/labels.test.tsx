/**
 * Every box in the Horror d100 editor is named, and stops at the length a
 * sheet stores; a skill's experience check can be reached from the keyboard.
 *
 * Almost no box was tied to a label, so a screen reader announced them by a
 * placeholder or not at all; only the character's name stopped at the
 * server's length; and the experience checks were boxes drawn with a click
 * handler, which a keyboard could not reach and a screen reader did not know.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HorrorD100CharacterEditor } from '../HorrorD100CharacterEditor';
import type { CharacterData } from '../../../../types';
import type { HorrorD100Sheet } from '@/types/game-systems/horrorD100Sheet';
import { blankSkills, horrorD100Character } from './sheetFixture';
import { SHEET_LONG_TEXT_MAX, SHEET_NAME_MAX, SHEET_SHORT_TEXT_MAX } from '@/constants/sheetLimits';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const weapon = { name: '.38 Revolver', skill: 'Handgun', skillValue: 20, damage: '1d10', range: '15 yards', attacks: 1, ammo: 6, malfunction: 100, notes: '' };
const rated = { value: 20, experienceCheck: false };

function open(tab: RegExp) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  const sheet: Partial<HorrorD100Sheet> = {
    weapons: [weapon],
    armor: [{ name: 'Oilskin coat', armorValue: 1, notes: '' }],
    story: [{ title: 'Background', text: 'Went to sea at fourteen.' }],
    skills: blankSkills({
      languageOther: [{ specialty: 'Latin', ...rated }],
      own: [{ name: 'Charm', ...rated, notes: 'Learned at sea' }],
    }),
  };
  render(<HorrorD100CharacterEditor character={horrorD100Character(sheet)} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('tab', { name: tab }));
  return onSave;
}

describe.each([
  ['Overview', /^Overview$/, [
    'Character name', 'Profession', 'Era', 'Age', 'Sex', 'Residence', 'Birthplace',
    'STR', 'CON', 'SIZ', 'INT', 'POW', 'DEX', 'CHA', 'EDU', 'Use EDU, the optional characteristic for education',
    'Current Sanity', 'Starting Sanity', 'Current HP', 'Current PP', 'MOV',
    'Major Wound', 'Dying', 'Unconscious', 'Temporary Insanity',
  ]],
  ['Skills', /^Skills$/, [
    'Value of Appraise', 'Experience check for Appraise', 'Value of Language (Own)', 'Own language',
    'Name of language 1', 'Value of Language (Latin)', 'Specialty of Knowledge 1', 'Value of Knowledge (Blasphemous Lore)',
    'Name of own skill 1', 'Value of Charm', 'Notes on Charm', 'Combat skill to add', 'Add Combat skill', 'Add Skill',
  ]],
  ['Combat', /^Combat$/, [
    'Name of weapon 1', 'Skill of weapon 1', 'Skill value of weapon 1', 'Damage of weapon 1', 'Range of weapon 1',
    'Attacks of weapon 1', 'Ammunition of weapon 1', 'Malfunction of weapon 1', 'Notes on weapon 1',
    'Name of armor 1', 'Armor value of armor 1', 'Notes on armor 1',
  ]],
  ['Possessions', /^Possessions$/, ['Wealth Level', 'Cash on Hand', 'Assets', 'Wealth notes', 'Possessions']],
  ['Story', /^Story$/, ['Title of note 1', 'Text of note 1', 'Distinctive features', 'Height', 'Skin', 'Spells']],
])('the %s tab', (_name, tab, labels) => {
  it.each(labels)('names the %s box', (label) => {
    open(tab);
    expect(screen.getAllByLabelText(label, { exact: true }).length).toBeGreaterThan(0);
  });
});

describe('text lengths', () => {
  it('stop one-line boxes at the one-line limit', () => {
    open(/^Overview$/);
    for (const label of ['Profession', 'Era', 'Residence', 'Birthplace']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('maxLength', String(SHEET_SHORT_TEXT_MAX));
    }
  });

  it('stop a story note\'s title at a name\'s length and its text at the paragraph limit', () => {
    open(/^Story$/);
    expect(screen.getByLabelText('Title of note 1')).toHaveAttribute('maxLength', String(SHEET_NAME_MAX));
    expect(screen.getByLabelText('Text of note 1')).toHaveAttribute('maxLength', String(SHEET_LONG_TEXT_MAX));
  });

  it('stop a skill\'s notes and a weapon\'s at the paragraph limit', () => {
    open(/^Skills$/);
    expect(screen.getByLabelText('Notes on Charm')).toHaveAttribute('maxLength', String(SHEET_LONG_TEXT_MAX));
    fireEvent.click(screen.getByRole('tab', { name: /^Combat$/ }));
    expect(screen.getByLabelText('Notes on weapon 1')).toHaveAttribute('maxLength', String(SHEET_LONG_TEXT_MAX));
  });
});

describe('an experience check', () => {
  it('is a checkbox the keyboard reaches', async () => {
    const onSave = open(/^Skills$/);
    const check = screen.getByRole('checkbox', { name: 'Experience check for Appraise' });
    expect(check).not.toBeChecked();
    fireEvent.click(check);
    expect(check).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((onSave.mock.calls[0][0] as HorrorD100Sheet).skills?.appraise.experienceCheck).toBe(true);
  });

  it('is offered on no skill the rules give none: Status and Knowledge (Blasphemous Lore)', () => {
    open(/^Skills$/);
    expect(screen.getByLabelText('Value of Status')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Experience check for Status' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Experience check for Knowledge (Blasphemous Lore)' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Experience check for Language (Latin)' })).toBeInTheDocument();
  });
});

// The player's name is read-only in the header. With no label, a character
// with no player showed a bare dash before Profession.
describe('the player in the editor\'s header', () => {
  it('is labelled, with or without a name', () => {
    open(/^Overview$/);
    const label = screen.getByText('Player:');
    expect(label.parentElement).toHaveTextContent(/^Player: (—|\S.*)$/);
  });
});
