/**
 * The Horror d100 editor stops adding to a list where the server stops
 * keeping it.
 *
 * The server refuses a sheet whose weapons, armor, story notes, possessions,
 * spells or skills hold more than their list's limit, so an add button or a box that went past it made a
 * sheet that could be filled in and not saved. Here the limit is two, so two
 * rows fill a list.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HorrorD100CharacterEditor } from '../HorrorD100CharacterEditor';
import { blankSkills, horrorD100Character } from './sheetFixture';
import type { HorrorD100Sheet } from '@/types/game-systems/horrorD100Sheet';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/constants/sheetLimits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/constants/sheetLimits')>()),
  SHEET_LIST_MAX: 2,
  HORROR_D100_FIREARM_LIST_MAX: 3,
  HORROR_D100_OWN_SKILL_LIST_MAX: 4,
}));

const FULL = /This list is full: a sheet holds at most 2 entries here/;

function open(tab: string, overrides: Partial<HorrorD100Sheet>) {
  render(<HorrorD100CharacterEditor character={horrorD100Character(overrides)} onSave={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('tab', { name: tab }));
}

const weapon = (name: string) => ({ name, skill: 'Brawl', skillValue: 25, damage: '1d3', range: 'Short', attacks: 1, ammo: null, malfunction: null, notes: '' });
const specialty = (name: string) => ({ specialty: name, value: 20, experienceCheck: false });
const ownSkill = (name: string) => ({ name, value: 20, experienceCheck: false });

describe('the weapons list', () => {
  it('turns Add Weapon off at the limit, and says why', () => {
    open('Combat', { weapons: [weapon('Knife'), weapon('Club')] });
    expect(screen.getByRole('button', { name: 'Add Weapon' })).toBeDisabled();
    expect(screen.getByText(FULL)).toBeInTheDocument();
  });

  it('keeps Add Weapon on while there is room', () => {
    open('Combat', { weapons: [weapon('Knife')] });
    expect(screen.getByRole('button', { name: 'Add Weapon' })).toBeEnabled();
    expect(screen.queryByText(FULL)).toBeNull();
  });
});

describe('the possessions box', () => {
  const box = () => screen.getByPlaceholderText(/List possessions/) as HTMLTextAreaElement;

  it('does not take a third possession, and says why', () => {
    open('Possessions', { possessions: [{ name: 'Knife', notes: '' }, { name: 'Rope', notes: '' }] });
    fireEvent.change(box(), { target: { value: 'Knife\nRope\nLantern' } });

    expect(box().value).toBe('Knife\nRope');
    expect(screen.getByText(FULL)).toBeInTheDocument();
  });

  it('takes a possession while there is room', () => {
    open('Possessions', { possessions: [{ name: 'Knife', notes: '' }] });
    fireEvent.change(box(), { target: { value: 'Knife\nRope' } });

    expect(box().value).toBe('Knife\nRope');
  });
});

describe('the spells box', () => {
  const box = () => screen.getByPlaceholderText(/Call the Grey Lantern/) as HTMLTextAreaElement;

  it('does not take a third spell, and says why', () => {
    open('Story', { spells: ['Ward of Ash', 'Sign of Embers'] });
    fireEvent.change(box(), { target: { value: 'Ward of Ash\nSign of Embers\nBanish' } });

    expect(box().value).toBe('Ward of Ash\nSign of Embers');
    expect(screen.getByText(FULL)).toBeInTheDocument();
  });
});

describe('the armor and the story notes', () => {
  it('turn Add Armor off at the limit, and say why', () => {
    open('Combat', { armor: [{ name: 'Coat' }, { name: 'Helmet' }] });
    expect(screen.getByRole('button', { name: 'Add Armor' })).toBeDisabled();
    expect(screen.getByText(FULL)).toBeInTheDocument();
  });

  it('turn Add Note off at the limit, and say why', () => {
    open('Story', { story: [{ title: 'One', text: '' }, { title: 'Two', text: '' }] });
    expect(screen.getByRole('button', { name: 'Add Note' })).toBeDisabled();
    expect(screen.getByText(FULL)).toBeInTheDocument();
  });
});

// A sheet converted from the one before 1.7.0 can hold three firearms and
// four own skills more than any other list, so those two stop later.
describe('the skill lists', () => {
  /** Chooses a skill in its category's add control, and gives the control's button. */
  const choose = (category: string, skill: string) => {
    const select = screen.getByLabelText(`${category} skill to add`) as HTMLSelectElement;
    const option = Array.from(select.options).find((found) => found.textContent === skill || found.textContent?.startsWith(`${skill}, `));
    if (!option) throw new Error(`${category} offers no ${skill}`);
    fireEvent.change(select, { target: { value: option.value } });
    return screen.getByRole('button', { name: `Add ${category} skill` });
  };

  it('stop a list of specialties at the list limit', () => {
    open('Skills', { skills: blankSkills({ science: [specialty('Botany'), specialty('Geology')] }) });
    expect(choose('Mental', 'Science (Chemistry)')).toBeDisabled();
    expect(screen.getByText(FULL)).toBeInTheDocument();
    expect(choose('Mental', 'Knowledge (Occult)')).toBeEnabled();
    expect(screen.queryByText(FULL)).toBeNull();
  });

  it('stop the firearms at their own limit', () => {
    open('Skills', { skills: blankSkills({ firearm: [specialty('Pistol'), specialty('Rifle')] }) });
    const button = choose('Combat', 'Firearm (Shotgun)');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(screen.getByText(/This list is full: a sheet holds at most 3 entries here/)).toBeInTheDocument();
    // The category's other lists still take entries.
    expect(choose('Combat', 'Parry')).toBeEnabled();
  });

  it('stop the own skills at their own limit', () => {
    open('Skills', { skills: blankSkills({ own: [ownSkill('Charm'), ownSkill('Intimidate'), ownSkill('Survival')] }) });
    expect(screen.getByRole('button', { name: 'Add Skill' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add Skill' }));
    expect(screen.getByRole('button', { name: 'Add Skill' })).toBeDisabled();
    expect(screen.getByText(/This list is full: a sheet holds at most 4 entries here/)).toBeInTheDocument();
  });
});
