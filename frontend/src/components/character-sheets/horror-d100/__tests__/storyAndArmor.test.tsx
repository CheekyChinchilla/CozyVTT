/**
 * The story notes, distinctive features and armor of the rebuilt Horror d100
 * sheet.
 *
 * A character's story is a list of notes, each with a title of the player's
 * own, in the order the player puts them: the fixed boxes the sheet had
 * before became notes, and more can be added. Armor is a list of pieces, each
 * with its armor value.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { HorrorD100CharacterEditor } from '../HorrorD100CharacterEditor';
import { HorrorD100CharacterView } from '../HorrorD100CharacterView';
import type { CharacterData } from '../../../../types';
import type { HorrorD100Sheet } from '@/types/game-systems/horrorD100Sheet';
import { horrorD100Character } from './sheetFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

function open(tab: string, overrides: Partial<HorrorD100Sheet> = {}) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<HorrorD100CharacterEditor character={horrorD100Character(overrides)} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('tab', { name: tab }));
  return async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return onSave.mock.calls[0][0] as HorrorD100Sheet;
  };
}

const story = [
  { title: 'Background & History', text: 'Went to sea at fourteen.' },
  { title: 'Important People', text: 'Captain Duarte.' },
  { title: '', text: '  kept as typed\n' },
];

describe('the story notes in the editor', () => {
  it('are added, titled and written', async () => {
    const save = open('Story');
    expect(screen.getByText(/No notes yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Note' }));
    expect(screen.getByLabelText('Title of note 1')).toHaveValue('New note');
    fireEvent.change(screen.getByLabelText('Title of note 1'), { target: { value: 'Old Injuries' } });
    fireEvent.change(screen.getByLabelText('Text of note 1'), { target: { value: 'A limp since Madeira.' } });
    expect((await save()).story).toEqual([{ title: 'Old Injuries', text: 'A limp since Madeira.' }]);
  });

  it('are renamed and removed', async () => {
    const save = open('Story', { story });
    fireEvent.change(screen.getByLabelText('Title of note 2'), { target: { value: 'Shipmates' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Background & History' }));
    expect((await save()).story).toEqual([{ title: 'Shipmates', text: 'Captain Duarte.' }, story[2]]);
  });

  it('are moved up and down, the first not up and the last not down', async () => {
    const save = open('Story', { story });
    expect(screen.getByRole('button', { name: 'Move Background & History up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move note 3 down' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move note 3 up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Background & History down' }));
    expect((await save()).story).toEqual([story[2], story[0], story[1]]);
  });

  it('are saved as stored, white space and an empty title included, when nothing is typed', async () => {
    const save = open('Story', { story });
    expect((await save()).story).toEqual(story);
  });
});

describe('the story on the read-only sheet', () => {
  it('shows each note under its title, in order, and one with no title as untitled', () => {
    render(<HorrorD100CharacterView character={horrorD100Character({ story, distinctiveFeatures: ['One gold earring', 'A rope burn'] })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Story' }));
    expect(screen.getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent)).toEqual(['Background & History', 'Important People', 'Untitled note']);
    expect(screen.getByText('Went to sea at fourteen.')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['One gold earring', 'A rope burn']);
  });

  it('shows no story, features or spells box for a character with none', () => {
    render(<HorrorD100CharacterView character={horrorD100Character()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Story' }));
    expect(within(screen.getByRole('tabpanel')).queryByRole('heading')).toBeNull();
  });
});

describe('distinctive features in the editor', () => {
  it('are one to a line', async () => {
    const save = open('Story', { distinctiveFeatures: ['One gold earring'] });
    const box = screen.getByRole('textbox', { name: 'Distinctive features' });
    expect(box).toHaveValue('One gold earring');
    fireEvent.change(box, { target: { value: 'One gold earring\nA rope burn' } });
    expect((await save()).distinctiveFeatures).toEqual(['One gold earring', 'A rope burn']);
  });
});

describe('armor', () => {
  it('is added with a name, an armor value and notes', async () => {
    const save = open('Combat');
    expect(screen.getByText('No armor worn')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Armor' }));
    fireEvent.change(screen.getByLabelText('Name of armor 1'), { target: { value: 'Oilskin coat' } });
    fireEvent.change(screen.getByLabelText('Armor value of armor 1'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Notes on armor 1'), { target: { value: 'Heavy when wet' } });
    expect((await save()).armor).toEqual([{ name: 'Oilskin coat', armorValue: 1, notes: 'Heavy when wet' }]);
  });

  it('is removed', async () => {
    const save = open('Combat', { armor: [{ name: 'Oilskin coat', armorValue: 1 }, { name: 'Sea boots' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Oilskin coat' }));
    expect((await save()).armor).toEqual([{ name: 'Sea boots' }]);
  });

  it('is listed on the read-only sheet with its armor value and notes', () => {
    render(<HorrorD100CharacterView character={horrorD100Character({ armor: [{ name: 'Oilskin coat', armorValue: 1, notes: 'Heavy when wet' }, { name: 'Sea boots' }] })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Combat' }));
    expect(screen.getByText('Oilskin coat').parentElement).toHaveTextContent('Oilskin coatArmor value 1');
    expect(screen.getByText('Heavy when wet')).toBeInTheDocument();
    expect(screen.getByText('Sea boots').parentElement?.textContent).toBe('Sea boots');
  });
});
