/**
 * What the Horror d100 editor works out, and what it leaves to the player.
 *
 * The open d100 rules give maximum hit points, the major wound level,
 * maximum power points, the damage modifier, the experience bonus and
 * maximum Sanity from the characteristics and Knowledge (Blasphemous Lore).
 * Those follow as their source is typed. Every number the player can type is
 * saved as they left it, and nothing is worked out again as a sheet opens.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { HorrorD100CharacterEditor } from '../HorrorD100CharacterEditor';
import type { CharacterData } from '../../../../types';
import type { HorrorD100Sheet } from '@/types/game-systems/horrorD100Sheet';
import { blankSheet, blankSkills, horrorD100Character } from './sheetFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

function open(overrides: Partial<HorrorD100Sheet> = {}) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<HorrorD100CharacterEditor character={horrorD100Character(overrides)} onSave={onSave} onCancel={vi.fn()} />);
  return async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return onSave.mock.calls[0][0] as HorrorD100Sheet;
  };
}

/** Types a number into a box as a player does: cleared, then a digit at a time. */
function type(box: HTMLElement, value: string) {
  fireEvent.change(box, { target: { value: '' } });
  for (let length = 1; length <= value.length; length += 1) fireEvent.change(box, { target: { value: value.slice(0, length) } });
}

const characteristic = (name: string) => screen.getByRole('spinbutton', { name });
/** The text of the derived attribute whose label is `label`, such as "HP Max:". */
const derived = (label: string) => screen.getByText(label).parentElement?.textContent ?? '';

describe('a characteristic\'s roll', () => {
  it('is shown under it at five times its value, Luck under POW, and none under SIZ', () => {
    open({ characteristics: { STR: 12, CON: 13, SIZ: 11, INT: 15, POW: 14, DEX: 16, CHA: 9, EDU: 17 } });
    const block = (name: string) => characteristic(name).parentElement!.parentElement!;
    expect(block('STR')).toHaveTextContent('Effort60%');
    expect(block('CON')).toHaveTextContent('Stamina65%');
    expect(block('INT')).toHaveTextContent('Idea75%');
    expect(block('POW')).toHaveTextContent('Luck70%');
    expect(block('DEX')).toHaveTextContent('Agility80%');
    expect(block('CHA')).toHaveTextContent('Charm45%');
    expect(block('EDU')).toHaveTextContent('Knowledge85%');
    expect(block('SIZ').textContent).toBe('SIZ');
  });

  it('follows the characteristic as it is typed', () => {
    open();
    type(characteristic('POW'), '17');
    expect(characteristic('POW').parentElement!.parentElement!).toHaveTextContent('Luck85%');
  });
});

describe('the derived attributes', () => {
  it('are worked out from the characteristics as they are typed', () => {
    open();
    type(characteristic('CON'), '13');
    type(characteristic('SIZ'), '14');
    type(characteristic('STR'), '16');
    type(characteristic('INT'), '15');
    type(characteristic('POW'), '12');
    expect(derived('HP Max:')).toContain('14');
    expect(derived('Major Wound:')).toContain('7 HP');
    expect(derived('PP Max:')).toContain('12');
    expect(derived('Damage Modifier:')).toContain('+1D4');
    expect(derived('Experience Bonus:')).toContain('+8%');
  });

  it('round the major wound level up from an odd maximum', () => {
    open({ hitPoints: { maximum: 13, current: 13 } });
    expect(derived('Major Wound:')).toContain('7 HP');
  });

  it('keep the damage taken and the points spent as the maximum moves', async () => {
    const save = open({ hitPoints: { maximum: 10, current: 4 }, powerPoints: { maximum: 10, current: 3 } });
    type(characteristic('CON'), '16');
    type(characteristic('POW'), '15');
    const saved = await save();
    expect(saved.hitPoints).toEqual({ maximum: 13, current: 7 });
    expect(saved.powerPoints).toEqual({ maximum: 15, current: 8 });
  });

  it('never save power points below 0', async () => {
    const save = open({ powerPoints: { maximum: 10, current: 2 } });
    type(characteristic('POW'), '5');
    expect((await save()).powerPoints).toEqual({ maximum: 5, current: 0 });
  });

  it('are not worked out again as a sheet opens', async () => {
    const stored = { hitPoints: { maximum: 20, current: -2 }, powerPoints: { maximum: 3, current: 3 }, sanity: { starting: 31, maximum: 60, current: 44 }, move: 6 };
    const save = open(stored);
    expect(derived('HP Max:')).toContain('20');
    expect(derived('Max SAN:')).toContain('60');
    expect(await save()).toMatchObject(stored);
  });
});

describe('the numbers the player types', () => {
  it('take current hit points below 0', async () => {
    const save = open();
    const box = screen.getByLabelText('Current HP');
    fireEvent.change(box, { target: { value: '-4' } });
    fireEvent.blur(box);
    expect(box).toHaveValue(-4);
    expect((await save()).hitPoints).toEqual({ maximum: 10, current: -4 });
  });

  it('take a MOV of the player\'s own, 10 on a sheet that has none', async () => {
    const { move: _none, ...rest } = blankSheet();
    const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
    render(<HorrorD100CharacterEditor character={{ ...horrorD100Character(), data: rest as CharacterData }} onSave={onSave} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('MOV')).toHaveValue(10);
    type(screen.getByLabelText('MOV'), '12');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((onSave.mock.calls[0][0] as HorrorD100Sheet).move).toBe(12);
  });

  it('leave Sanity where it was when POW changes, and say where a new character starts', async () => {
    const save = open();
    type(characteristic('POW'), '15');
    expect(screen.getByText(/A new character's Sanity starts at five times POW \(75\)/)).toBeInTheDocument();
    expect((await save()).sanity).toEqual({ starting: 50, maximum: 99, current: 50 });
  });

  it('tick the conditions, four of them', async () => {
    const save = open();
    const conditions = screen.getByRole('heading', { name: 'Current Conditions' }).parentElement!;
    expect(within(conditions).getAllByRole('checkbox').map((box) => box.parentElement?.textContent)).toEqual(['Major Wound', 'Dying', 'Unconscious', 'Temporary Insanity']);
    fireEvent.click(within(conditions).getByLabelText('Dying'));
    expect((await save()).conditions).toEqual({ dying: true });
  });
});

describe('the skills that start from a characteristic', () => {
  it('move by as much as their base chance moves, keeping the points put into them', async () => {
    const save = open({ skills: blankSkills({ dodge: { value: 47, experienceCheck: true }, gaming: { value: 12, experienceCheck: false } }) });
    type(characteristic('DEX'), '13');
    type(characteristic('INT'), '12');
    const { skills } = await save();
    expect(skills?.dodge).toEqual({ value: 53, experienceCheck: true });
    expect(skills?.gaming.value).toBe(14);
    expect(skills?.languageOwn.value).toBe(60);
    expect(skills?.spot.value).toBe(25);
  });

  it('are saved from 0 up, whatever the characteristic takes them to', async () => {
    const save = open({ skills: blankSkills({ dodge: { value: 4, experienceCheck: false } }) });
    type(characteristic('DEX'), '3');
    expect((await save()).skills?.dodge.value).toBe(0);
  });
});

describe('the optional EDU', () => {
  it('is dropped with its roll, and no EDU is saved while its box is unticked', async () => {
    const save = open({ characteristics: { ...blankSheet().characteristics, EDU: 16 } });
    const uses = screen.getByLabelText('Use EDU, the optional characteristic for education');
    expect(uses).toBeChecked();
    fireEvent.click(uses);
    expect(screen.queryByRole('spinbutton', { name: 'EDU' })).toBeNull();
    expect(screen.queryByText('Knowledge')).toBeNull();
    fireEvent.click(uses);
    // Ticked again in the same edit, it comes back as it was.
    expect(characteristic('EDU')).toHaveValue(16);
    fireEvent.click(uses);
    const saved = await save();
    expect(saved.characteristics).toEqual({ STR: 10, CON: 10, SIZ: 10, INT: 10, POW: 10, DEX: 10, CHA: 10 });
    // The own language's base was five times EDU, 80; without EDU it is five
    // times INT, 50, and the rating of 50 moves down by the 30 between.
    expect(saved.skills?.languageOwn.value).toBe(20);
  });

  it('comes back with the own language where it was when the box is unticked and ticked again', async () => {
    const save = open({ characteristics: { ...blankSheet().characteristics, EDU: 16 } });
    const uses = screen.getByLabelText('Use EDU, the optional characteristic for education');
    fireEvent.click(uses);
    fireEvent.click(uses);
    const saved = await save();
    expect(saved.characteristics.EDU).toBe(16);
    expect(saved.skills?.languageOwn.value).toBe(50);
  });

  it('is taken up at 10 on a sheet that had none', async () => {
    const { EDU: _none, ...seven } = blankSheet().characteristics;
    const save = open({ characteristics: seven });
    fireEvent.click(screen.getByLabelText('Use EDU, the optional characteristic for education'));
    expect((await save()).characteristics.EDU).toBe(10);
  });
});

describe('Knowledge (Blasphemous Lore)', () => {
  it('lowers maximum Sanity as it is typed on the Skills tab, and current Sanity with it', async () => {
    const save = open({ sanity: { starting: 50, maximum: 99, current: 70 } });
    fireEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    type(screen.getByLabelText('Value of Knowledge (Blasphemous Lore)'), '43');
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(derived('Max SAN:')).toContain('57');
    expect(screen.getByText('(100 − 43 Blasphemous Lore)')).toBeInTheDocument();
    const saved = await save();
    expect(saved.sanity).toEqual({ starting: 50, maximum: 57, current: 57 });
    expect(saved.skills?.knowledge).toEqual([{ specialty: 'Blasphemous Lore', value: 43, experienceCheck: false }]);
  });

  it('raises the maximum again when it is lowered, and leaves current Sanity where it was', async () => {
    const lore = blankSkills({ knowledge: [{ specialty: 'Blasphemous Lore', value: 40, experienceCheck: false }] });
    const save = open({ skills: lore, sanity: { starting: 50, maximum: 60, current: 55 } });
    fireEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    type(screen.getByLabelText('Value of Knowledge (Blasphemous Lore)'), '10');
    expect((await save()).sanity).toEqual({ starting: 50, maximum: 90, current: 55 });
  });
});

describe('a new character', () => {
  it('is saved as the blank sheet the server made it with, with only its header colour added', async () => {
    const save = open();
    expect(await save()).toEqual({ ...blankSheet(), themeColor: 'Dark Forest' });
  });
});
