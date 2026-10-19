/**
 * Specialised skills on the Call of Cthulhu sheet.
 *
 * The editor showed the specialised skills a sheet already had and offered no
 * way to add, rename or remove one: no Fighting or Firearms specialisation
 * beyond Brawl and the three printed guns, no other language, no science, no
 * skill of the player's own, and no way to name an Art/Craft, Pilot or
 * Survival specialisation or the investigator's own language. Each list now
 * has an add control, offering the Keeper Rulebook's specialisations with
 * their base values, and each row a name box and a remove button.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import { CallOfCthulhu7eCharacterView } from '../CallOfCthulhu7eCharacterView';
import type { CharacterData } from '../../../../types';
import { COC_BLANK_SHEET, cocCharacter } from './cocFixture';

const skills = COC_BLANK_SHEET.skills as Record<string, unknown>;
type Saved = { skills: Record<string, unknown> };

function open(overrides: Record<string, unknown> = {}) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<CallOfCthulhu7eCharacterEditor character={cocCharacter(overrides)} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /^Skills$/ }));
  return async (): Promise<Saved['skills']> => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return (onSave.mock.calls[0][0] as unknown as Saved).skills;
  };
}

const add = (list: string, choice?: string) => {
  if (choice) fireEvent.change(screen.getByLabelText(`${list} to add`), { target: { value: choice } });
  fireEvent.click(screen.getByRole('button', { name: `Add ${list}` }));
};

describe('adding a specialisation', () => {
  it('adds a Fighting specialisation at its base', async () => {
    const save = open();
    add('Fighting specialisation', 'Sword');
    const saved = await save();
    expect(saved.fighting).toMatchObject({ custom: [{ specialization: 'Sword', baseValue: 20, currentValue: 20, improvementChecked: false }] });
  });

  it('adds a Firearms specialisation at its base', async () => {
    const save = open();
    add('Firearms specialisation', 'Bow');
    expect((await save()).firearms).toMatchObject({ custom: [{ specialization: 'Bow', baseValue: 15 }] });
  });

  it('adds a science at its base', async () => {
    const save = open();
    add('Science', 'Physics');
    expect((await save()).science).toEqual([{ specialization: 'Physics', baseValue: 1, currentValue: 1, improvementChecked: false }]);
  });

  it('adds another language, which can be named', async () => {
    const save = open();
    add('Language');
    fireEvent.change(screen.getByLabelText('Name of language 1'), { target: { value: 'Latin' } });
    expect((await save()).languageOther).toEqual([{ language: 'Latin', baseValue: 1, currentValue: 1, improvementChecked: false }]);
  });

  it('adds a skill of the player\'s own, which can be named', async () => {
    const save = open();
    add('Skill');
    fireEvent.change(screen.getByLabelText('Name of skill 1'), { target: { value: 'Cryptozoology' } });
    expect((await save()).customSkills).toMatchObject([{ name: 'Cryptozoology' }]);
  });
});

describe('the rows', () => {
  const withScience = () => ({
    skills: {
      ...skills,
      science: [{ specialization: 'Physics', baseValue: 1, currentValue: 30, improvementChecked: false }],
      fighting: { brawl: { baseValue: 25, currentValue: 25, improvementChecked: false }, custom: [{ specialization: 'Sword', baseValue: 20, currentValue: 20, improvementChecked: false }] },
    },
  });

  it('can be removed', async () => {
    const save = open(withScience());
    fireEvent.click(screen.getByRole('button', { name: 'Remove Science (Physics)' }));
    expect((await save()).science).toEqual([]);
  });

  it('take a new value, a specialisation\'s included', async () => {
    const save = open(withScience());
    fireEvent.change(screen.getByLabelText('Value of Fighting (Sword)'), { target: { value: '45' } });
    expect((await save()).fighting).toMatchObject({ custom: [{ specialization: 'Sword', currentValue: 45 }] });
  });

  it('name an Art/Craft specialisation and the own language', async () => {
    const save = open();
    fireEvent.change(screen.getByLabelText('Art/Craft specialisation'), { target: { value: 'Photography' } });
    fireEvent.change(screen.getByLabelText('Own language'), { target: { value: 'French' } });
    const saved = await save();
    expect(saved.artCraft).toMatchObject({ specialization: 'Photography' });
    expect(saved.languageOwn).toMatchObject({ language: 'French' });
  });
});

describe('the read-only sheet', () => {
  it('shows a Fighting specialisation by its name', () => {
    render(
      <CallOfCthulhu7eCharacterView
        character={cocCharacter({
          skills: { ...skills, fighting: { brawl: { baseValue: 25, currentValue: 25, improvementChecked: false }, custom: [{ specialization: 'Sword', baseValue: 20, currentValue: 40, improvementChecked: false }] } },
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /^Skills$/ }));
    expect(screen.getByText('Fighting (Sword)')).toBeInTheDocument();
  });
});
